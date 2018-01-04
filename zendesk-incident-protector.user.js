// ==UserScript==
// @name           Zendesk Incident Protector
// @version        1.0.0
// @description    Prevent replying to customer with specific NG keywords
// @author         XFLAG Studio CRE Team
// @include        https://*.zendesk.com/*
// @exclude        https://analytics.zendesk.com/*
// @exclude        https://*.zendesk.com/knowledge/*
// @require        https://code.jquery.com/jquery-3.2.1.min.js
// ==/UserScript==

(function() {
  'use strict';

  class NGWordManager {
    constructor(localStorageKey) {
      this.localStorageKey = localStorageKey;
    }

    isConfigURLEmpty() {
      let configURL = localStorage.getItem(this.localStorageKey);
      return configURL === null;
    }
    setConfigURL(arg) {
      if (this.isValidConfigURL(arg)) {
        localStorage.setItem(this.localStorageKey, arg);
      }
    }
    isValidConfigURL(arg) {
      try {
        let url = new URL(arg);
        return true;
      } catch (e) {
        return false;
      }
    }
  }

  // execute UserScript on browser, and export NGWordManager class on test
  if (typeof window === 'object') {
    const localStorageKey = 'zendeskIncidentProtectorConfigURL';

    let ngWordManager = new NGWordManager(localStorageKey);
    let runUserScript = () => {
      if (ngWordManager.isConfigURLEmpty()) {
        let configURL = window.prompt('[Zendesk 事故防止ツール]\nNGワードの設定が記載されたURLを指定してください', '');

        ngWordManager.setConfigURL(configURL);
      }
    };

    runUserScript();
  } else {
    module.exports = NGWordManager;
  }
})();
