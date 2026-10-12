# Optional static hosting on S3 + CloudFront

An optional alternative to the default Next.js hosting: the site built as static files (`STATIC_EXPORT=1 next build`),
served from a private S3 bucket behind CloudFront. Nothing here is used by `npm run dev`, `npm run build` or CI.

## Set up and deploy

1. Create the stack from `../aws/site.json` (CloudFormation, any region), passing your own account id as the
   `AllowedAccountId` parameter; the change set fails in any other account. Review the change set before executing it:
   `aws cloudformation create-change-set --change-set-type CREATE --stack-name airplane-systems-site --template-body file://infra/aws/site.json --parameters ParameterKey=AllowedAccountId,ParameterValue=<your-account-id> --region <region> --change-set-name create`
2. Deploy main's tip with your own AWS CLI credentials for that account:
   `DEPLOY_AWS_ACCOUNT=<your-account-id> DEPLOY_AWS_REGION=<region> npm run deploy:aws`
   (`--stack`, `--account`, `--region` and `--rollback-to <sha>` are documented in `scripts/deploy-aws.sh --help`).
   The bucket, distribution and `dxxxx.cloudfront.net` name are read from the stack outputs; none is configured here.
3. The deploy ends with `npm run smoke -- https://<distribution domain>`; run it by hand at any time.

The deploy script's tests run offline against stub `aws` and `npm` commands: `npm run test:deploy`.

## Design

The resource definitions live in `../aws/site.json`. No custom domain is configured.

- Private S3 regional REST origin: all four Block Public Access flags, BucketOwnerEnforced ownership, SSE-S3;
  no website endpoint. OAC signs every origin request with SigV4. Allow only CloudFront's service principal,
  scoped to the distribution ARN, GetObject on bucket objects and ListBucket on the bucket. ListBucket lets
  missing keys return 404 rather than 403. Sources: [OAC and policy](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html),
  [Block Public Access](https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html),
  [GetObject permissions](https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetObject.html).
- Versioning enabled; expire noncurrent versions after 30 days (`NoncurrentDays`). Deploys upload without
  deleting, keeping older hashed assets usable. Upload, invalidation and rollback are `scripts/deploy-aws.sh`. Sources: [versioning](https://docs.aws.amazon.com/AmazonS3/latest/userguide/Versioning.html),
  [lifecycle](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lifecycle-mgmt.html),
  [invalidation](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Invalidation.html).
- DefaultRootObject `index.html`; HTTP redirects to HTTPS, HTTP/2 and HTTP/3, compression enabled.
  Keep the default CloudFront certificate/name. Default certificate TLS settings are CloudFront's defaults.
  PriceClass_100 by default, the cheapest (`PriceClass`). Source:
  [viewer HTTPS](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-https-viewers-to-cloudfront.html).
- `/_next/static/*`: managed CachingOptimized, no Function; uploads set `public, max-age=31536000, immutable`.
  Default behavior: custom HTML cache min/default/max TTL 0/60/300 seconds, no cookies, headers or query in
  the cache key. Uploads set `public, max-age=60` for HTML, text and other unhashed files. Sources:
  [managed cache policies](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-cache-policies.html),
  [TTL and origin headers](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Expiration.html).
- Origin 404 uses `/404.html`, retains status 404, error TTL 10 seconds. Never map errors to a 200 root page.
  Source: [custom error responses](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/GeneratingCustomErrorResponses.html).
- Default behavior only: viewer-request Function, runtime cloudfront-js-2.0, source `view-rewrite.js`.
  Recognized airplane with zero or one system segment redirects a trailing slash with 308, preserving queries;
  without a trailing slash it rewrites to `/index.html`. Any single system name, including `bogus`, is accepted,
  as the development rewrite in `next.config.ts` does. Root, unknown aircraft, assets and deeper paths
  pass through. Root is served by DefaultRootObject. Tests use `lib/viewPaths.ts` and compare the copied
  airplane list against `AIRCRAFT_IDS` in `lib/systems.ts`. Sources:
  [Functions](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cloudfront-functions.html),
  [event/query format](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/functions-event-structure.html).

Security headers: both the default and `/_next/static/*` behaviors in `infra/aws/site.json` associate the
AWS-managed SecurityHeadersPolicy ID `67f7725c-6f97-4210-82d7-5512b31e9d03`. The template test requires both
associations. A search of app/ and components/ found no iframe or frame embedding requirement. Applying a template change to a live stack is a reviewed change set. Source:
[managed response header policies, SecurityHeadersPolicy](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-response-headers-policies.html#managed-response-headers-policies-security).

Redirect query names and values are percent-encoded for header safety while preserving existing valid percent
escapes and form-query `+` markers. Repeated values remain repeated; key-only parameters normalize to `key=`.
The Function does not assume every event value is already URL-encoded. AWS documents that UTF-8 request values
are forwarded unchanged and recommends percent encoding:
[edge-function encoding restrictions](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/edge-function-restrictions-all.html#edge-function-restrictions-encoding).
Live verification should include `/sr22t/?a=x%26y%0D%0A` and assert the Location retains those escapes.

Offline tests require exact equality between the template FunctionCode and this source, including whitespace;
format the source first, copy it to FunctionCode, then format the JSON. Missing source must fail.
Route, 404, cache and HTTPS checks against a live site are `npm run smoke -- <site-url>`.
