window.ENV = {
  ...(window.ENV || {}),
  LB_RUNTIME_MODE: window.ENV?.LB_RUNTIME_MODE || "local",
  LB_RUNTIME_CLIENT: window.ENV?.LB_RUNTIME_CLIENT || "local",
  LB_CLOUD_AUTH_DOMAIN: window.ENV?.LB_CLOUD_AUTH_DOMAIN || "operator.system36.app"
};
