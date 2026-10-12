// Viewer request, cloudfront-js-2.0. Mirrors next.config.ts's development view rule.
// AIRCRAFT_IDS is copied from lib/systems.ts; the offline test prevents drift.
// Event/query format: https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/functions-event-structure.html
var AIRCRAFT_IDS = ["sr20", "sr22t", "c172s", "c182t", "da40", "m20c"];

// AWS recommends percent encoding; UTF-8 request values are forwarded unchanged:
// https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/edge-function-restrictions-all.html
function encodeQueryComponent(value) {
  // Escape raw separators/control characters without double-encoding existing percent escapes.
  // Keep '+' as the original form-query space marker; an encoded literal plus stays %2B.
  return value
    .split("+")
    .map(function (part) {
      return encodeURIComponent(part).replace(/%25([0-9a-f]{2})/gi, "%$1");
    })
    .join("+");
}

function handler(event) {
  var request = event.request;
  var match = /^\/([^/]+)(?:\/([^/]+))?(\/)?$/.exec(request.uri);
  if (!match || AIRCRAFT_IDS.indexOf(match[1]) === -1) return request;

  if (match[3]) {
    var query = [];
    Object.keys(request.querystring).forEach(function (key) {
      var item = request.querystring[key];
      var values = item.multiValue || [item];
      values.forEach(function (entry) {
        query.push(encodeQueryComponent(key) + "=" + encodeQueryComponent(entry.value));
      });
    });
    return {
      statusCode: 308,
      statusDescription: "Permanent Redirect",
      headers: {
        location: { value: request.uri.slice(0, -1) + (query.length ? "?" + query.join("&") : "") },
      },
    };
  }

  request.uri = "/index.html";
  return request;
}
