// ==UserScript==
// @name           Zendesk Incident Protector
// @version        1.0.0
// @description    Prevent replying to customer with specific NG keywords
// @author         XFLAG Studio CRE Team
// @include        https://*.zendesk.com/*
// @exclude        https://analytics.zendesk.com/*
// @exclude        https://*.zendesk.com/knowledge/*
// @require        https://code.jquery.com/jquery-3.2.1.min.js
// @require        https://cdnjs.cloudflare.com/ajax/libs/superagent/3.8.2/superagent.min.js
// ==/UserScript==

(function() {
  'use strict';

  // TODO:
  // fix to use CDN
  // Add minified script to https://github.com/azu/wait-for-element.js
  function waitForElement(selector) {
    const timeout    = 10 * 1000; // 10s
    const loopTime   = 100;
    const limitCount = timeout / loopTime;

    let tryCount = 0;

    function tryCheck(resolve, reject) {
      if (tryCount < limitCount) {
        var element = document.querySelector(selector);
        if (element != null) {
          return resolve(element);
        }
        setTimeout(function () {
          tryCheck(resolve, reject);
        }, loopTime);
      } else {
        reject(new Error('Not found element match the selector:' + selector));
      }
      tryCount++;
    }

    return new Promise(function (resolve, reject) {
      tryCheck(resolve, reject);
    });
  }

  class NGWordManager {
    constructor(localStorageKey) {
      this.localStorageKey = localStorageKey;
      this.request         = window.superagent;
    }

    static get UI_CONSTANTS() {
      return {
        selector: {
          commentActionTarget: 'div.comment_input_wrapper div.fr-focus div.content div.header span.active',
          commentTextArea: 'div.comment_input_wrapper div.fr-focus div.content div.body div.ember-view div.editor div.zendesk-editor--rich-text-comment'
        },
        attribute: {
          publicCommentClass: 'track-id-publicComment'
        }
      };
    }

    get config() {
      return this._config;
    }

    set config(arg) {
      this._config = arg;
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
    fetchConfig() {
      let configURL = localStorage.getItem(this.localStorageKey);

      return new Promise((resolve, reject) => {
        this.request
          .get(configURL)
          .then(function(response) {
            resolve(response.body);
          })
          .catch(function(error) {
            reject(new Error('[Zendesk事故防止ツール]\n\n設定ファイルが取得できませんでした。\n継続して発生する場合は開発者にお知らせ下さい。'));
          });
      });
    }
    isPublicResponse() {
      let publicCommentClass  = NGWordManager.UI_CONSTANTS.attribute.publicCommentClass;
      let commentActionTarget = $(NGWordManager.UI_CONSTANTS.selector.commentActionTarget).attr('class');

      return !commentActionTarget ? false : commentActionTarget.includes(publicCommentClass);
    }
    isTargetHost(host) {
      return this.config.hosts.includes(host);
    }
    isIncludeTargetWord(text, host) {
      let commonTargetWords = this.config.targetWords.common;
      let targetWords       = this.config.targetWords[host];

      let allTargetWords = Array.isArray(targetWords) ? commonTargetWords.concat(targetWords) : commonTargetWords;

      return allTargetWords.some(word => text.includes(word));
    }
    createConfirmText(text) {
      let prefix = '以下の文章はパブリック返信にふさわしくないキーワードが含まれているおそれがあります。\n\n';
      let suffix = '\n\n本当に送信しますか？';

      let rawText = $(text).text();

      return prefix + rawText + suffix;
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
      } else {
        ngWordManager.fetchConfig()
          .then(
            (object) => {
              ngWordManager.config = object;
            }
          ).catch(
            (error) => { alert(error.message); }
          );
      }
    };

    runUserScript();
  } else {
    module.exports = {
      NGWordManager: NGWordManager
    };
  }
})();
