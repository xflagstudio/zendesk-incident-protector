let chai         = require('chai');
let path         = require('path');
let localStorage = require('mock-local-storage');
let request      = require('superagent');
let nock         = require('nock');
let assert       = require('assert');
let jsdom        = require('jsdom');
let should       = chai.should();

let NGWordManager = require(path.join(__dirname, '..', 'zendesk-incident-protector.user.js'));
const { JSDOM } = jsdom;
const defaultDOM = new JSDOM(`
<!-- comment textarea -->
<div class="comment_input_wrapper">
  <div class="fr-focus">
    <div class="content">
      <div class="header">
        <span class="ember-view btn track-id-publicComment active"></span>
        <span class="ember-view btn track-id-privateComment"></span>
      </div>
      <div class="body">
        <div class="ember-view">
          <div class="editor">
            <div class="zendesk-editor--rich-text-comment"><p>test</p><p>message</p></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
`);

// mock URL class
class URL {
  constructor(arg) {
    if (arg.includes('http')) {
      return {};
    } else {
      throw new TypeError('URL');
    }
  }
}
global.URL = URL;

// define window after require user.js
global.window = defaultDOM.window;
global.$      = require('jquery');

window.superagent   = request;
window.localStorage = global.localStorage;

describe('NGWordManager', () => {
  const localStorageKey = 'testLocalStorageKey';
  const configDomain    = 'https://path.to';
  const configPath      = '/config.json';
  const configURL       = configDomain + configPath;
  const mockConfig      = {
    'hosts': [
      'aaa.zendesk.com',
      'bbb.zendesk.com',
      'ccc.zendesk.com',
      'ddd.zendesk.com'
    ],
    'targetWords': {
      'common': ['test', 'memo'],
      'aaa.zendesk.com': ['(aaa|xxx)'],
      'bbb.zendesk.com': ['bbb'],
      'ccc.zendesk.com': ['ccc']
    }
  };

  let ngWordManager;

  beforeEach(() => {
    ngWordManager = new NGWordManager(localStorageKey);
  });

  afterEach(() => {
    window.localStorage.clear();
    window.localStorage.itemInsertionCallback = null;
  });

  describe('#isConfigURLEmpty', () => {
    context('localStorage is empty', () => {
      it('should return true', () => {
        ngWordManager.isConfigURLEmpty().should.equal(true);
      });
    });
    context('localStorage exists', () => {
      before(() => {
        window.localStorage.setItem(localStorageKey, configURL);
      });

      it('should return false', () => {
        ngWordManager.isConfigURLEmpty().should.equal(false);
      });
    });
  });

  describe('#setConfigURL', () => {
    context('arg is URL', () => {
      it('should set arg to localStorage', () => {
        let arg = configURL;

        ngWordManager.setConfigURL(arg);
        window.localStorage.getItem(localStorageKey).should.equal(arg);
      });
    });

    context('arg is not URL', () => {
      it('does not set localStorage', () => {
        let arg = 'not url';

        ngWordManager.setConfigURL(arg);
        should.equal(window.localStorage.getItem(localStorageKey), null);
      });
    });
  });

  describe('#isValidConfigURL', () => {
    context('arg is URL', () => {
      it('should return true', () => {
        ngWordManager.isValidConfigURL(configURL).should.equal(true);
      });
    });

    context('arg is not URL', () => {
      it('should return false', () => {
        ngWordManager.isValidConfigURL('not url').should.equal(false);
      });
    });
  });

  describe('fetchConfig', () => {
    beforeEach(() => {
      ngWordManager.setConfigURL(configURL);
    });

    context('GET config has been successfully finished', () => {
      before(() => {
        nock(configDomain).get(configPath).reply(200, mockConfig);
      });

      it('returns config', (done) => {
        ngWordManager.fetchConfig()
          .then((object) => {
            assert.deepEqual(object, mockConfig);
            done();
          }).catch((error) => {
            done(error);
          });
      });
    });

    context('GET config failed', () => {
      before(() => {
        nock(configDomain).get(configPath).reply(404);
      });

      it('throws error', (done) => {
        let expectedMessage = '[Zendesk事故防止ツール]\n\n設定ファイルが取得できませんでした。\n継続して発生する場合は開発者にお知らせ下さい。';

        ngWordManager.fetchConfig()
          .then((object) => {
            done(new Error('Expected to reject'));
          }).catch((error) => {
            error.message.should.equal(expectedMessage);
            done();
          }).catch(done);
      });
    });
  });

  describe('isPublicResponse', () => {
    context('tab of public response has been selected', () => {
      it('returns true', () => {
        ngWordManager.isPublicResponse().should.equal(true);
      });
    });

    context('tab of private response has been selected', () => {
      before(() => {
        $('span.track-id-publicComment').removeClass('active');
        $('span.track-id-privateComment').addClass('active');
      });

      it('returns false', () => {
        ngWordManager.isPublicResponse().should.equal(false);
      });
    });
  });
  describe('isTargetHost', () => {
    let config = mockConfig;

    context('host defined in config', () => {
      let host = 'aaa.zendesk.com';

      it('returns true', () => {
        ngWordManager.isTargetHost(config, host).should.equal(true);
      });
    });

    context('host not defined in config', () => {
      let host = 'unknown.zendesk.com';

      it('returns false', () => {
        ngWordManager.isTargetHost(config, host).should.equal(false);
      });
    });
  });

  describe('isIncludeTargetWord', () => {
    let config = mockConfig;

    // text with word in common target words
    let text1 = 'test hogehoge';
    // text with word in target words of aaa.zendesk.com
    let text2 = '(aaa|xxx) hogehoge';
    // text without target words
    let text3 = 'aaa hogehoge';

    context('target words at host is defined', () => {
      it('judges target words defined on common and host', () => {
        let host = 'aaa.zendesk.com';

        ngWordManager.isIncludeTargetWord(mockConfig, text1, host).should.equal(true);
        ngWordManager.isIncludeTargetWord(mockConfig, text2, host).should.equal(true);
        ngWordManager.isIncludeTargetWord(mockConfig, text3, host).should.equal(false);
      });
    });

    context('target words at host is not defined', () => {
      it('judges target words defined on common', () => {
        let host = 'ddd.zendesk.com';

        ngWordManager.isIncludeTargetWord(mockConfig, text1, host).should.equal(true);
        ngWordManager.isIncludeTargetWord(mockConfig, text2, host).should.equal(false);
        ngWordManager.isIncludeTargetWord(mockConfig, text3, host).should.equal(false);
      });
    });
  });

  describe('createConfirmText', () => {
    let text = $(NGWordManager.UI_CONSTANTS.selector.commentTextArea).html();
    let expectedText = 'testmessage';

    it('returns confirm text', () => {
      let confirmText = ngWordManager.createConfirmText(text);

      confirmText.includes(expectedText).should.equal(true);
    });
  });
});
