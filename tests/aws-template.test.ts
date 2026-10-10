import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The CloudFormation template for the S3 + CloudFront site. It is plain JSON so
// this test parses it without a YAML library.
type Node = Record<string, any>; // untyped CloudFormation JSON
const root = new URL("..", import.meta.url);
const template: Node = JSON.parse(readFileSync(new URL("infra/aws/site.json", root), "utf8"));
const res = (id: string): Node => template.Resources[id].Properties;
const statements = (doc: Node): Node[] => doc.Statement;

describe("infra/aws/site.json", () => {
  it("holds no IAM resources and no OIDC parameter, since deploys run locally", () => {
    const types = Object.values(template.Resources).map((r) => (r as Node).Type);
    expect(types.filter((t) => t.startsWith("AWS::IAM::"))).toEqual([]);
    expect(template.Parameters).not.toHaveProperty("CreateOidcProvider");
    expect(template).not.toHaveProperty("Conditions");
    // scripts/deploy-aws.sh reads BucketName, DistributionId and DistributionDomainName.
    expect(Object.keys(template.Outputs).sort()).toEqual([
      "BucketName",
      "DistributionDomainName",
      "DistributionId",
      "SiteUrl",
    ]);
    expect(JSON.stringify(template)).not.toMatch(/token\.actions\.githubusercontent\.com|DeployRole|GitHubOidc/);
  });

  it("serves only through the default *.cloudfront.net name, with index.html as the root object", () => {
    const dist = res("SiteDistribution").DistributionConfig;
    expect(dist).not.toHaveProperty("Aliases");
    expect(dist.ViewerCertificate).toEqual({ CloudFrontDefaultCertificate: true });
    expect(JSON.stringify(template)).not.toMatch(/AcmCertificateArn|IamCertificateId|:acm:/);
    expect(dist.DefaultRootObject).toBe("index.html");
  });

  it("keeps unknown paths 404 and caches hashed assets with the managed CachingOptimized policy", () => {
    const dist = res("SiteDistribution").DistributionConfig;
    expect(dist.CustomErrorResponses).toEqual([
      { ErrorCode: 404, ResponseCode: 404, ResponsePagePath: "/404.html", ErrorCachingMinTTL: 10 },
    ]);
    expect(dist.CacheBehaviors.map((b: Node) => [b.PathPattern, b.CachePolicyId])).toEqual([
      ["/_next/static/*", "658327ea-f89d-4fab-a63d-7e88639e58f6"],
    ]);
    expect(dist.DefaultCacheBehavior.CachePolicyId).toEqual({ Ref: "HtmlShortCache" });
    const html = res("HtmlShortCache").CachePolicyConfig;
    expect([html.MinTTL, html.DefaultTTL, html.MaxTTL]).toEqual([0, 60, 300]);
  });

  it("applies managed SecurityHeadersPolicy to HTML and hashed assets", () => {
    // AWS-managed ID: https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-response-headers-policies.html#managed-response-headers-policies-security
    const dist = res("SiteDistribution").DistributionConfig;
    const policyId = "67f7725c-6f97-4210-82d7-5512b31e9d03";
    expect(dist.DefaultCacheBehavior.ResponseHeadersPolicyId).toBe(policyId);
    expect(dist.CacheBehaviors).toHaveLength(1);
    expect(dist.CacheBehaviors[0].PathPattern).toBe("/_next/static/*");
    expect(dist.CacheBehaviors[0].ResponseHeadersPolicyId).toBe(policyId);
  });

  it("blocks all public access to the bucket", () => {
    expect(res("SiteBucket").PublicAccessBlockConfiguration).toEqual({
      BlockPublicAcls: true,
      BlockPublicPolicy: true,
      IgnorePublicAcls: true,
      RestrictPublicBuckets: true,
    });
  });

  it("lets only the distribution read the bucket, scoped by AWS:SourceArn", () => {
    const sourceArn = {
      "Fn::Sub": "arn:${AWS::Partition}:cloudfront::${AWS::AccountId}:distribution/${SiteDistribution}",
    };
    const stmts = statements(res("SiteBucketPolicy").PolicyDocument);
    expect(stmts.map((s) => s.Action).sort()).toEqual(["s3:GetObject", "s3:ListBucket"]);
    for (const s of stmts) {
      expect(s.Effect).toBe("Allow");
      expect(s.Principal).toEqual({ Service: "cloudfront.amazonaws.com" });
      expect(s.Condition).toEqual({ StringEquals: { "AWS:SourceArn": sourceArn } });
    }
  });

  it("versions the bucket and expires only noncurrent versions", () => {
    const bucket = res("SiteBucket");
    expect(bucket.VersioningConfiguration).toEqual({ Status: "Enabled" });
    expect(bucket.LifecycleConfiguration.Rules).toEqual([
      {
        Id: "ExpireOldVersions",
        Status: "Enabled",
        NoncurrentVersionExpiration: { NoncurrentDays: { Ref: "NoncurrentDays" } },
        ExpiredObjectDeleteMarker: true,
        AbortIncompleteMultipartUpload: { DaysAfterInitiation: 7 },
      },
    ]);
    expect(JSON.stringify(bucket.LifecycleConfiguration)).not.toMatch(/ExpirationInDays|ExpirationDate/);
    expect(template.Parameters.NoncurrentDays.Default).toBe(30);
  });

  it("requires the committed view-rewrite Function and exact template parity", () => {
    const code = res("ViewRewrite").FunctionCode;
    const source = new URL("infra/cloudfront/view-rewrite.js", root);
    expect(code).toBe(readFileSync(source, "utf8"));
    expect(res("ViewRewrite").FunctionConfig.Runtime).toBe("cloudfront-js-2.0");
  });

  it("refuses a change set outside the account named by the AllowedAccountId parameter", () => {
    // Rules syntax: https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/rules-section-structure.html
    const assertion = (rule: string): Node[] =>
      template.Rules[rule].Assertions.map((a: Node) => a.Assert["Fn::Equals"]);
    expect(Object.keys(template.Rules)).toEqual(["AccountIsAllowed"]);
    expect(assertion("AccountIsAllowed")).toEqual([[{ Ref: "AWS::AccountId" }, { Ref: "AllowedAccountId" }]]);
    expect(template.Parameters.AllowedAccountId).toMatchObject({ Type: "String", AllowedPattern: "^[0-9]{12}$" });
    expect(template.Parameters.AllowedAccountId).not.toHaveProperty("Default");
  });

  it("names no account id, so each deployer supplies their own", () => {
    expect(JSON.stringify(template)).not.toMatch(/(?<![0-9])[0-9]{12}(?![0-9])/);
  });

  it("holds no credentials", () => {
    expect(JSON.stringify(template)).not.toMatch(/AKIA|ASIA|aws_secret|SecretAccessKey|AccessKeyId/i);
  });
});
