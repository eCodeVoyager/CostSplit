// CloudFront Function (viewer request) for the S3-hosted web app.
// - /download/ and other folders serve their index.html
// - app routes like /t/<id> and /join/<id> serve the single-page app
function handler(event) {
  var request = event.request
  var uri = request.uri
  if (uri.endsWith("/")) {
    request.uri = uri + "index.html"
  } else if (uri === "/download") {
    request.uri = "/download/index.html"
  } else if (uri.indexOf(".") === -1) {
    request.uri = "/index.html"
  }
  return request
}
