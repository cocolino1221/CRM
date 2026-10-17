const { expo } = require('./app.json');

const android = {
  ...expo.android,
};

if (process.env.GOOGLE_SERVICES_JSON) {
  android.googleServicesFile = process.env.GOOGLE_SERVICES_JSON;
} else {
  delete android.googleServicesFile;
}

module.exports = {
  expo: {
    ...expo,
    android,
  },
};
