var express = require('express');
var router = express.Router();

const EF_SERVICE_NAME = 'kyma-multitenant-approuter-multitenancy';
const EF_SERVICE_PORT = 8080;
const EF_APIRULE_DEFAULT_NAMESPACE = '<namespace>';
const KYMA_APIRULE_GROUP = 'gateway.kyma-project.io';
const KYMA_APIRULE_VERSION = 'v1alpha1';
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
        var line1 = "Hello " + req.authInfo.getLogonName();
        var line2 = "your tenant sub-domain is " + req.authInfo.getSubdomain();
        var line3 = "your tenant zone id is " + req.authInfo.getZoneId();
        var responseMsg = line1 + "; " + line2 + "; " + line3;
        res.send(responseMsg);
    } catch (e) {
        console.log("AuthInfo object undefined.");
        var responseMsg = "Hello World!";
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
    var tenantAppURL = "https:\/\/" + consumerSubdomain + "-approuter." + "<cluster-domain>";

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
        const result = await k8sApi.getNamespacedCustomObject(KYMA_APIRULE_GROUP,
            KYMA_APIRULE_VERSION,
            EF_APIRULE_DEFAULT_NAMESPACE,
            KYMA_APIRULE_PLURAL,
            apiRuleTempl.metadata.name);
        //console.log(result.response);
        if (result.response.statusCode == 200) {
            console.log(apiRuleTempl.metadata.name + ' already exists.');
            res.status(200).send(tenantAppURL);
        }
    } catch (err) {
        //create apirule if non-exist
        console.warn(apiRuleTempl.metadata.name + ' does not exist, creating one...');
        try {
            const createResult = await k8sApi.createNamespacedCustomObject(KYMA_APIRULE_GROUP,
                KYMA_APIRULE_VERSION,
                EF_APIRULE_DEFAULT_NAMESPACE,
                KYMA_APIRULE_PLURAL,
                apiRuleTempl);
            console.log(createResult.response);

            if (createResult.response.statusCode == 201) {
                console.log("API Rule created!");
                res.status(200).send(tenantAppURL);
            }
        } catch (err) {
            console.log(err);
            console.error("Fail to create APIRule");
            res.status(500).send("create APIRule error");
        }
    }
    console.log("exiting onboarding...");
    res.status(200).send(tenantAppURL)
});

/**
 * Request Method Type - DELETE
 * When a consumer unsubscribes this application, SaaS Provisioning invokes this API.
 * We delete the consumer entry in the SaaS Provisioning service.
 */
router.delete('/callback/v1.0/tenants/*', async function(req, res) {
    console.log(req.body);
    var consumerSubdomain = req.body.subscribedSubdomain;

    //delete apirule with subdomain
    const kc = new k8s.KubeConfig();
    kc.loadFromCluster();

    const k8sApi = kc.makeApiClient(k8s.CustomObjectsApi);

    const apiRuleTempl = createApiRule.createApiRule(
        EF_SERVICE_NAME,
        EF_SERVICE_PORT,
        consumerSubdomain + "-approuter",
        kyma_cluster);

    try {
        const result = await k8sApi.deleteNamespacedCustomObject(
            KYMA_APIRULE_GROUP,
            KYMA_APIRULE_VERSION,
            EF_APIRULE_DEFAULT_NAMESPACE,
            KYMA_APIRULE_PLURAL,
            apiRuleTempl.metadata.name);
        if (result.response.statusCode == 200) {
            console.log("API Rule deleted!");
        }
    } catch (err) {
        console.error(err);
        console.error("API Rule deletion error");
    }

    res.status(200).send("deleted");
});
//************************************************************************************************

module.exports = router;