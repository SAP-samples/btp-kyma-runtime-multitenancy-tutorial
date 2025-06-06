var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');

var app = express();

//**************************** Libraries for enabling authentication *****************************
var passport = require('passport');
var xsenv = require('@sap/xsenv');
//************************************************************************************************

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

//*********************************** Enabling authorization  ***********************************
console.log('Fetching xsuaa service...');
const services = xsenv.getServices({xsuaa: { label: 'xsuaa' }});
const credentials = services.xsuaa;
const { XssecPassportStrategy, XsuaaService } = require("@sap/xssec");
const authService = new XsuaaService(credentials) // or: IdentityService, XsaService, UaaService ...
console.log( `Found XSUAA service credentials for client: ${services.xsuaa.clientid}` )
passport.use(new XssecPassportStrategy(authService));

console.log('Initializing passport...');
app.use(passport.initialize());

console.log('Authenticating with JWT strategy...');
app.use('/callback', passport.authenticate('JWT', { session: false }));
app.use('/users', passport.authenticate('JWT', { session: false }));
app.use('/user', passport.authenticate('JWT', { session: false }));
//************************************************************************************************

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/user', indexRouter);
app.use('/users', usersRouter);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
    next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
    // set locals, only providing error in development
    res.locals.message = err.message;
    res.locals.error = req.app.get('env') === 'development' ? err : {};

    // render the error page
    res.status(err.status || 500);
    res.render('error');
});

module.exports = app;