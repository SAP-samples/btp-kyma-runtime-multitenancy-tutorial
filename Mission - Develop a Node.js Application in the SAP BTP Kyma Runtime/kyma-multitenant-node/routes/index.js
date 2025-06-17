var express = require('express');
var router = express.Router();

/**
 * This is the default end-point when someone accesses the SaaS application.
 * Always returns: "Hello World!"
 * If any error occurs, responds with status 500.
 */
router.get("/", function(req, res, next) {
    try {
        // Return 'Hello World!' since auth info is not available in this app
        res.send("Hello World!");
    } catch (e) {
        res.status(500).send("Server error occurred: " + e.message);
    }
});

module.exports = router;