// ==UserScript==
// @name           Zendesk Incident Protector
// @version        1.0.1
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
        reject(new Error(`Not found element match the selector:${selector}`));
      }
      tryCount++;
    }

    return new Promise(function (resolve, reject) {
      tryCheck(resolve, reject);
    });
  }

  class NotTargetHost extends Error {
    constructor(message) {
      super(message);
    }
  }

  // NOTE:
  // Zendesk dashboard can show multiple tickets by separating tabs.
  // This class manages whether to set validator or not with each tabs
  // by recording id attribute of div tag on submit button.
  class ValidatorManager {
    constructor() {
      this.idsWithValidator = [];
    }

    static get UI_CONSTANTS() {
      return {
        selector: {
          sectionPanel: 'section.main_panes:not([style*="display:none"]):not([style*="display: none"])',
          footerPanelArea: 'footer.ticket-resolution-footer div.ticket-resolution-footer-pane',
          buttonViewArea: 'div div div[class ^= "ButtonGroupView"]'
        }
      };
    }

    targetButtonAreaSelector() {
      const idFilter = this.idsWithValidator.map(id => `:not([id='${id}'])`).join("");

      return `${ValidatorManager.UI_CONSTANTS.selector.sectionPanel} ${ValidatorManager.UI_CONSTANTS.selector.footerPanelArea} div${idFilter} ${ValidatorManager.UI_CONSTANTS.selector.buttonViewArea}`;
    }

    getButtonViewId(dom) {
      // NOTE:
      // get nearest id attribute on parent div.ember-view
      return $(dom).parent().parent().parent().attr('id');
    }

    addValidator(targetWords, buttonViewId, locale) {
      if (buttonViewId !== undefined && !this.hasValidator(buttonViewId)) {
        this.idsWithValidator.push(buttonViewId);

        console.log(`button view with id:${buttonViewId} added. idsWithValidator:${this.idsWithValidator}`);

        const buttonDOM = `${ValidatorManager.UI_CONSTANTS.selector.footerPanelArea} div#${buttonViewId} ${ValidatorManager.UI_CONSTANTS.selector.buttonViewArea} button`;

        let ngWordValidator = new NGWordValidator(buttonDOM, targetWords, locale);

        ngWordValidator.run();

        return ngWordValidator;
      }
      if (this.hasValidator(buttonViewId)) {
        console.log(`button area with id:${buttonViewId} has been already set validator.`);
      }
    }

    hasValidator(id) {
      return this.idsWithValidator.includes(id);
    }
  }

  class NGWordManager {
    constructor(localStorageKey, locale) {
      this.localStorageKey = localStorageKey;
      this.request         = window.superagent;
      this.locale          = locale;
    }

    get config() {
      return this._config;
    }

    set config(arg) {
      this._config = arg;
    }

    get configURL() {
      return localStorage.getItem(this.localStorageKey);
    }

    set configURL(arg) {
      if (this.isValidConfigURL(arg)) {
        localStorage.setItem(this.localStorageKey, arg);
      }
    }

    isConfigURLEmpty() {
      return this.configURL === null;
    }

    isValidConfigURL(arg) {
      try {
        const url = new URL(arg);
        return true;
      } catch (e) {
        return false;
      }
    }
    fetchConfig() {
      const errorMessage = {
        'ja': '[Zendesk 事故防止ツール]\n\n設定ファイルが取得できませんでした。\n継続して発生する場合は開発者にお知らせ下さい。',
        'en': '[Zendesk Incident Protector]\n\nCan not get configuration file.\nPlease notify to developer if this occurs repeatedly.'
      };
      let that = this;

      if (this.config !== undefined) {
        return Promise.resolve(this.config);
      }

      return new Promise((resolve, reject) => {
        this.request
          .get(this.configURL)
          .then(function(response) {
            resolve(response.body);
          })
          .catch(function(error) {
            reject(new Error(errorMessage[that.locale]));
          });
      });
    }
    isTargetHost(host) {
      return this.config.hosts.includes(host);
    }
    toTargetWords(host) {
      const commonTargetWords = this.config.targetWords.common;
      const targetWords       = this.config.targetWords[host];

      return Array.isArray(targetWords) ? commonTargetWords.concat(targetWords) : commonTargetWords;
    }
  }

  class NGWordValidator {
    constructor(targetDOM, targetWords, locale) {
      this.targetDOM   = targetDOM;
      this.targetWords = targetWords;
      this.locale      = locale;
    }

    static get UI_CONSTANTS() {
      return {
        selector: {
          commentActionTarget: 'div.comment_input_wrapper div.comment_input:visible div.content div.header span.active',
          commentTextArea: 'div.comment_input_wrapper div.comment_input:visible div.content div.body div.ember-view div.editor div.zendesk-editor--rich-text-comment'
        },
        attribute: {
          publicCommentClass: 'track-id-publicComment'
        }
      };
    }

    static get CONFIRM_TEXT() {
      return {
        prefix: {
          'ja': '以下の文章はパブリック返信にふさわしくないキーワードが含まれているおそれがあります。\n\n',
          'en': 'Below contents may include inappropriate words for public reply.\n\n'
        },
        suffix: {
          'ja': '\n\n本当に送信しますか？',
          'en': '\n\nDO YOU REALLY SEND THIS TO CUSTOMER?'
        }
      }
    }

    run() {
      const that = this;
      let preventEvent = true;

      $(that.targetDOM).on('click', function(event) {
        const text = $(NGWordValidator.UI_CONSTANTS.selector.commentTextArea).text();

        if (that.isPublicResponse() && that.isIncludeTargetWord(text) && preventEvent) {
          event.preventDefault();
          event.stopPropagation();

          const confirmText = that.createConfirmText(text);

          if (!confirm(confirmText)) {
            return false;
          } else {
            preventEvent = false;
            $(this).trigger('click');
            preventEvent = true;
          }
        }
      });
    }

    isPublicResponse() {
      const publicCommentClass  = NGWordValidator.UI_CONSTANTS.attribute.publicCommentClass;
      const commentActionTarget = $(NGWordValidator.UI_CONSTANTS.selector.commentActionTarget).attr('class');

      return !commentActionTarget ? false : commentActionTarget.includes(publicCommentClass);
    }

    isIncludeTargetWord(text) {
      let isMatch = (pattern, text) => {
        const regexp = new RegExp(pattern);
        return regexp.test(text);
      };

      return this.targetWords.some(word => isMatch(word, text));
    }

    createConfirmText(text) {
      const prefix = NGWordValidator.CONFIRM_TEXT.prefix[this.locale];
      const suffix = NGWordValidator.CONFIRM_TEXT.suffix[this.locale];

      return prefix + text + suffix;
    }
  }

  // execute UserScript on browser, and export NGWordManager class on test
  if (typeof window === 'object') {
    const localStorageKey  = 'zendeskIncidentProtectorConfigURL';
    const host             = location.host;
    const targetPathRegExp = /agent\/tickets/;
    const locale           = window.navigator.language.match(/ja/) ? 'ja' : 'en';

    let ngWordManager    = new NGWordManager(localStorageKey, locale);
    let validatorManager = new ValidatorManager();

    let startValidation = (ngWordManager, validatorManager, path) => {
      if (!targetPathRegExp.test(path)) {
        return;
      }

      ngWordManager.fetchConfig()
        .then(
          (object) => {
            ngWordManager.config = object;

            if (ngWordManager.isTargetHost(host)) {
              return waitForElement(validatorManager.targetButtonAreaSelector());
            } else {
              return Promise.reject(new NotTargetHost());
            }
          }
        ).then(
          (object) => {
            console.log('submit button loaded!');

            const targetWords  = ngWordManager.toTargetWords(host);
            const buttonViewId = validatorManager.getButtonViewId(object);

            validatorManager.addValidator(targetWords, buttonViewId, locale);
          }
        )
        .catch((error) => {
          if (error instanceof NotTargetHost) {
            console.log('This zendesk instance is not target host for validation.');
          } else if (error.message.match(/Not found element/)) {
            console.log('element of validatorManager.targetButtonAreaSelector does not found.');
          } else {
            alert(error.message);
          }
        });
    };

    if (ngWordManager.isConfigURLEmpty()) {
      const promptMessage = {
        'ja': '[Zendesk 事故防止ツール]\nNGワードの設定が記載されたURLを指定してください',
        'en': '[Zendesk Incident Protector]\nPlease specify url which defined configuration of NG word.'
      };
      let configURL = window.prompt(promptMessage[locale], '');

      ngWordManager.configURL = configURL;
    }

    if (!ngWordManager.isConfigURLEmpty()) {
      startValidation(ngWordManager, validatorManager, location.href);
    }

    // override history.pushState
    // in order to hook startValidation when history.pushState called
    (function(history) {
      let pushState = history.pushState;

      history.pushState = function(state) {
        // path is set in third argument of history.pushState
        // ref. https://developer.mozilla.org/en-US/docs/Web/API/History_API#The_pushState()_method
        const path = arguments[2];

        startValidation(ngWordManager, validatorManager, path);

        return pushState.apply(history, arguments);
      };
    })(window.history);
  } else {
    module.exports = {
      ValidatorManager: ValidatorManager,
      NGWordManager: NGWordManager,
      NGWordValidator: NGWordValidator
    };
  }
})();
