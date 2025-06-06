var express = require('express');
var router = express.Router();

const EF_SERVICE_NAME = 'kyma-multitenant-approuter-multitenancy';
const EF_SERVICE_PORT = 8080;
const EF_APIRULE_DEFAULT_NAMESPACE = '<namespace>';  // Replace with your actual namespace
const KYMA_APIRULE_GROUP = 'gateway.kyma-project.io';
const KYMA_APIRULE_VERSION = 'v2';
const KYMA_APIRULE_PLURAL = 'apirules';

const k8s = require('@kubernetes/client-node');
const createApiRule = require('./createApiRule');
var kyma_cluster = process.env.CLUSTER_DOMAIN || "UNKNOWN";

/**
 * This is the default end-point when someone attempts to access the SaaS application.
 * We show a message to the logged in user.
 * Format of the message: Hello <logon name>; your tenant subdomain is <consumer sub-domain>; your tenant zone id is <consumer tenant id>
 * The logon name will be specific to each user.
 * The tenant zone and sub domain will be the same for all users of one consumer(tenant).
 * Otherwise, if there is no AuthInfo object found, We show the message "Hello World" to users.
 */
router.get("/", function(req, res, next) {
    try {
        var responseMsg = "Welcome to the Kyma Multitenant Application!";
        res.send(responseMsg);
    } catch (e) {
        console.log("AuthInfo object undefined.");
        var responseMsg = "Hello World!";
        res.send(responseMsg);
    }
});

router.get("/user", function(req, res, next) {
    try {
        var line1 = "Hello " + req.authInfo.getLogonName();
        var line2 = "your tenant sub-domain is " + req.authInfo.getSubdomain();
        var line3 = "your tenant zone id is " + req.authInfo.getZoneId();
        var responseMsg = line1 + "; " + line2 + "; " + line3;
        res.send(responseMsg);
    } catch (e) {
        console.log("AuthInfo object undefined.");
        var responseMsg = "Cannot get user information. Please check your authentication.";
        res.send(responseMsg);
    }
});

//******************************** API Callbacks for multitenancy ********************************

/**
 * Request Method Type - PUT
 * When a consumer subscribes to this application, SaaS Provisioning invokes this API.
 * We return the SaaS application url for the subscribing tenant.
 * This URL is unique per tenant and each tenant can access the application only through it's URL.
 */
router.put('/callback/v1.0/tenants/*', async function(req, res) {
    //1. create tenant unique URL
    var consumerSubdomain = req.body.subscribedSubdomain;
    var tenantAppURL = "https:\/\/" + consumerSubdomain + "-approuter." + "<clusterdomain>";  // Replace <clusterdomain> with your actual cluster domain

    //2. create apirules with subdomain,
    const kc = new k8s.KubeConfig();
    kc.loadFromCluster();
    const k8sApi = kc.makeApiClient(k8s.CustomObjectsApi);
    const apiRuleTempl = createApiRule.createApiRule(
        EF_SERVICE_NAME,
        EF_SERVICE_PORT,
        consumerSubdomain + "-approuter",
        kyma_cluster);

    try {
        await k8sApi.getNamespacedCustomObject({
            group: KYMA_APIRULE_GROUP,
            version: KYMA_APIRULE_VERSION,
            namespace: EF_APIRULE_DEFAULT_NAMESPACE,
            plural: KYMA_APIRULE_PLURAL,
            name: apiRuleTempl.metadata.name
        });
        // If found, respond and return early
        console.log(apiRuleTempl.metadata.name + ' already exists.');
        return res.status(200).send(tenantAppURL);
    } catch (err) {
        //create apirule if non-exist
        console.warn(apiRuleTempl.metadata.name + ' does not exist, creating one...');
        try {
            const createResult = await k8sApi.createNamespacedCustomObject({
                group: KYMA_APIRULE_GROUP,
                version: KYMA_APIRULE_VERSION,
                namespace: EF_APIRULE_DEFAULT_NAMESPACE,
                plural: KYMA_APIRULE_PLURAL,
                body: apiRuleTempl
            });
            console.log('APIRule creation result:', createResult);

            if (createResult && createResult.kind === "APIRule") {
                console.log("API Rule created!");
                return res.status(200).send(tenantAppURL);
            } else {
                // fallback: always send 200 if no error thrown
                return res.status(200).send(tenantAppURL);
            }
        } catch (err) {
            console.log(err);
            console.error("Fail to create APIRule");
            return res.status(500).send("create APIRule error");
        }
    }
});

/**
 * Request Method Type - DELETE
 * When a consumer unsubscribes this application, SaaS Provisioning invokes this API.
 * We delete the consumer entry in the SaaS Provisioning service.
 */
router.delete('/callback/v1.0/tenants/*', async function(req, res) {
    const consumerSubdomain = req.body.subscribedSubdomain;
    if (!consumerSubdomain) {
        return res.status(400).send("Missing 'subscribedSubdomain' in request body");
    }

    const kc = new k8s.KubeConfig();
    kc.loadFromCluster();
    const k8sApi = kc.makeApiClient(k8s.CustomObjectsApi);
    const apiRuleTempl = createApiRule.createApiRule(
        EF_SERVICE_NAME,
        EF_SERVICE_PORT,
        consumerSubdomain + "-approuter",
        kyma_cluster);

    try {
        await k8sApi.deleteNamespacedCustomObject({
            group: KYMA_APIRULE_GROUP,
            version: KYMA_APIRULE_VERSION,
            namespace: EF_APIRULE_DEFAULT_NAMESPACE,
            plural: KYMA_APIRULE_PLURAL,
            name: apiRuleTempl.metadata.name
        });
        console.log('APIRule deleted:', apiRuleTempl.metadata.name);
        return res.status(200).send("deleted");
    } catch (err) {
        if (err && err.statusCode === 404) {
            // Not found: treat as success (idempotent delete)
            console.warn('APIRule not found, treating as deleted:', apiRuleTempl.metadata.name);
            return res.status(200).send("deleted");
        }
        console.error("API Rule deletion error", err);
        return res.status(500).send("API Rule deletion error");
    }
});
//************************************************************************************************

module.exports = router;