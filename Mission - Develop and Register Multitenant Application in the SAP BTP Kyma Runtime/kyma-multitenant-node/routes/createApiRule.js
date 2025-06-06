module.exports = {
    createApiRule: createApiRule
}

function createApiRule(svcName, svcPort, host, clusterName) {

    let forwardUrl = host + '.' + clusterName;
    const supportedMethodsList = [
        'GET',
        'POST',
        'PUT',
        'PATCH',
        'DELETE',
        'HEAD',
    ];
    const access_strategy = {
        path: '/*',
        methods: supportedMethodsList,
        noAuth: true,
        // mutators: [{
        //     handler: 'header',
        //     config: {
        //         headers: {
        //             "x-forwarded-host": forwardUrl,
        //         }
        //     },
        // }],
        accessStrategies: [{
            handler: 'allow'
        }],
    };

    const apiRuleTemplate = {
        apiVersion: 'gateway.kyma-project.io/v2',
        kind: 'APIRule',
        metadata: {
            name: host + '-apirule',
        },
        spec: {
            gateway: 'kyma-system/kyma-gateway',
            hosts: [host],
            service: {
                name: svcName,
                port: svcPort,
            },
            rules: [access_strategy],
        },
    };
    return apiRuleTemplate;
}