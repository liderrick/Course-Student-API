const jwt = require('express-jwt');
const jwksRsa = require('jwks-rsa');

// For Auth0 Authentication API, used for user creation and login
module.exports.AUTH_CLIENT_ID =     "<auth0-authentication-api-client-id>";         // TODO: Replace with Auth0 Authentication API Client ID
module.exports.AUTH_CLIENT_SECRET = "<auth0-authentication-api-client-secret>";     // TODO: Replace with Auth0 Authentication API Client Secret

// For Auth0 Management API, used for user deletion
module.exports.MGMT_CLIENT_ID =     "<auth0-management-api-client-id>";             // TODO: Replace with Auth0 Management API Client ID
module.exports.MGMT_CLIENT_SECRET = "<auth0-management-api-client-secret>";         // TODO: Replace with Auth0 Management API Client Secret

module.exports.checkJwt = jwt({
    secret: jwksRsa.expressJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: `https://<auth0_project_name>.auth0.com/.well-known/jwks.json`           // TODO: Replace with Auth0 project name
    }),

    // Validate the audience and the issuer.
    issuer: `https://<auth0_project_name>.auth0.com/`,                                    // TODO: Replace with Auth0 project name
    algorithms: ['RS256'],
    credentialsRequired: false
});