let chai         = require('chai');
let sinon        = require('sinon');
let path         = require('path');
let localStorage = require('mock-local-storage');
let request      = require('superagent');
let nock         = require('nock');
let assert       = require('assert');
let jsdom        = require('jsdom');
let should       = chai.should();

const exportedClass = require(path.join(__dirname, '..', 'zendesk-incident-protector.user.js'));

const ValidatorManager = exportedClass.ValidatorManager;
const NGWordManager    = exportedClass.NGWordManager;
const NGWordValidator  = exportedClass.NGWordValidator;

const { JSDOM } = jsdom;
const defaultDOM = new JSDOM(`
<!-- comment textarea -->
<div class="comment_input_wrapper">
  <div class="comment_input">
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
<!-- submit button -->
<footer class="ticket-resolution-footer">
  <div class="ticket-resolution-footer-pane">
    <div id="ember1234" class="ember-view">
      <div dir="ltr">
        <div class="LRf LRg LRh LRi LRj">
          <div data-garden-id="buttons.button_group_view" data-garden-version="3.4.0" class="ButtonGroupView-hogehoge index__l-btn-group___hugahuga" dir="ltr">
            <button class="save">submit</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</footer>
`,
{ url: "http://localhost" });

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

describe('ValidatorManager', () => {
  const stub = sinon.stub($, 'filter');
  const expectedButtonViewId = 'ember1234';

  beforeEach(() => {
    validatorManager = new ValidatorManager();

    // NOTE:
    // mock $.fn.filter, because :visible is not supported in jsdom
    // ref. https://github.com/tmpvar/jsdom/issues/1048
    stub.returns($(ValidatorManager.UI_CONSTANTS.selector.buttonArea));
  });

  describe('addValidator', () => {
    it('adds button id into idsWithValidator', () => {
      const targetWords  = ['test', 'memo', '(aaa|xxx)', 'HOGE-\\d+', '\\(bbb\\|yyy\\)'];
      const buttonViewId = expectedButtonViewId;
      const locale       = 'ja';

      let validator = validatorManager.addValidator(targetWords, buttonViewId, locale);

      (validator instanceof NGWordValidator).should.equal(true);
      validatorManager.idsWithValidator.should.contain(expectedButtonViewId);
    });
  });

  describe('hasValidator', () => {
    context('before adding validator', () => {
      it('returns false', () => {
        const buttonViewId = expectedButtonViewId;
        validatorManager.hasValidator(buttonViewId).should.equal(false);
      });
    });

    context('after adding validator', () => {
      beforeEach(() => {
        const targetWords  = ['test', 'memo', '(aaa|xxx)', 'HOGE-\\d+', '\\(bbb\\|yyy\\)'];
        const buttonViewId = expectedButtonViewId;

        validatorManager.addValidator(targetWords, buttonViewId);
      });

      context('with added button id', () => {
        it('returns true', () => {
          const buttonViewId = expectedButtonViewId;
          validatorManager.hasValidator(buttonViewId).should.equal(true);
        });
      });

      context('with not added button id', () => {
        it('returns false', () => {
          const buttonViewId = 'unknown';
          validatorManager.hasValidator(buttonViewId).should.equal(false);
        });
      });
    });
  });
});

describe('NGWordManager', () => {
  const localStorageKey = 'testLocalStorageKey';
  const locale          = 'ja';
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
      'aaa.zendesk.com': ['(aaa|xxx)', 'HOGE-\\d+', '\\(bbb\\|yyy\\)'],
      'bbb.zendesk.com': ['bbb'],
      'ccc.zendesk.com': ['ccc']
    }
  };

  let ngWordManager;

  beforeEach(() => {
    ngWordManager = new NGWordManager(localStorageKey, locale);
  });

  afterEach(() => {
    global.localStorage.clear();
    global.localStorage.itemInsertionCallback = null;
  });

  describe('#isConfigURLEmpty', () => {
    context('localStorage is empty', () => {
      it('should return true', () => {
        ngWordManager.isConfigURLEmpty().should.equal(true);
      });
    });
    context('localStorage exists', () => {
      before(() => {
        global.localStorage.setItem(localStorageKey, configURL);
      });

      it('should return false', () => {
        ngWordManager.isConfigURLEmpty().should.equal(false);
      });
    });
  });

  describe('#set configURL', () => {
    context('arg is URL', () => {
      it('should set arg to localStorage', () => {
        ngWordManager.configURL = configURL;
        should.equal(ngWordManager.configURL, configURL);
      });
    });

    context('arg is not URL', () => {
      it('does not set localStorage', () => {
        ngWordManager.configURL = 'not url';
        should.equal(ngWordManager.configURL, null);
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
      ngWordManager.configURL = configURL;
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
        const expectedMessage = '[Zendesk 事故防止ツール]\n\n設定ファイルが取得できませんでした。\n継続して発生する場合は開発者にお知らせ下さい。';

        ngWordManager.fetchConfig()
          .then((object) => {
            done(new Error('Expected to reject'));
          }).catch((error) => {
            error.message.should.equal(expectedMessage);
            done();
          }).catch(done);
      });
    });

    describe('toTargetWords', () => {
      beforeEach(() => {
        ngWordManager.config = mockConfig;
      });

      context('target words at host is defined', () => {
        it('returns target words defined on common and host', () => {
          const host = 'aaa.zendesk.com';
          const expected = ['test', 'memo', '(aaa|xxx)', 'HOGE-\\d+', '\\(bbb\\|yyy\\)'];

          ngWordManager.toTargetWords(host).should.eql(expected);
        });
      });

      context('target words at host is not defined', () => {
        it('returns target words defined on common', () => {
          const host = 'ddd.zendesk.com';
          const expected = ['test', 'memo'];

          ngWordManager.toTargetWords(host).should.eql(expected);
        });
      });
    });
  });

  describe('isTargetHost', () => {
    beforeEach(() => {
      ngWordManager.config = mockConfig;
    });

    context('host defined in config', () => {
      const host = 'aaa.zendesk.com';

      it('returns true', () => {
        ngWordManager.isTargetHost(host).should.equal(true);
      });
    });

    context('host not defined in config', () => {
      const host = 'unknown.zendesk.com';

      it('returns false', () => {
        ngWordManager.isTargetHost(host).should.equal(false);
      });
    });
  });
});

describe('NGWordValidator', () => {
  const targetDOM   = ValidatorManager.UI_CONSTANTS.selector.buttonArea;
  const targetWords = ['test', 'memo', '(aaa|xxx)', 'HOGE-\\d+', '\\(bbb\\|yyy\\)'];
  const locale      = 'ja';

  // NOTE:
  // mock UI_CONSTANTS, because :visible is not supported in jsdom
  // ref. https://github.com/tmpvar/jsdom/issues/1048
  const mockUIConstants = {
    selector: {
      commentActionTarget: 'div.comment_input_wrapper div.comment_input div.content div.header span.active',
      commentTextArea: 'div.comment_input_wrapper div.comment_input div.content div.body div.ember-view div.editor div.zendesk-editor--rich-text-comment'
    },
    attribute: {
      publicCommentClass: 'track-id-publicComment'
    }
  }

  let ngWordValidator;

  beforeEach(() => {
    ngWordValidator = new NGWordValidator(targetDOM, targetWords, locale);
    sinon.stub(NGWordValidator, 'UI_CONSTANTS').get(function getterFn() {
      return mockUIConstants;
    });
  });

  describe('isPublicResponse', () => {
    context('tab of public response has been selected', () => {
      it('returns true', () => {
        ngWordValidator.isPublicResponse().should.equal(true);
      });
    });

    context('tab of private response has been selected', () => {
      before(() => {
        $('span.track-id-publicComment').removeClass('active');
        $('span.track-id-privateComment').addClass('active');
      });

      after(() => {
        $('span.track-id-publicComment').addClass('active');
        $('span.track-id-privateComment').removeClass('active');
      });

      it('returns false', () => {
        ngWordValidator.isPublicResponse().should.equal(false);
      });
    });
  });

  describe('isIncludeTargetWord', () => {
    // text with word in common target words
    const text1 = 'test hogehoge';
    // text with word in target words of aaa.zendesk.com
    const text2 = 'aaa hogehoge';
    const text3 = 'xxx hogehoge';
    const text4 = 'HOGE-1234 hogehoge';
    const text5 = '(bbb|yyy) hogehoge';
    // text without target words
    const text6 = 'HOGE- hogehoge';
    const text7 = 'bbb hogehoge';

    it('judges target words', () => {
      ngWordValidator.isIncludeTargetWord(text1).should.equal(true);
      ngWordValidator.isIncludeTargetWord(text2).should.equal(true);
      ngWordValidator.isIncludeTargetWord(text3).should.equal(true);
      ngWordValidator.isIncludeTargetWord(text4).should.equal(true);
      ngWordValidator.isIncludeTargetWord(text5).should.equal(true);
      ngWordValidator.isIncludeTargetWord(text6).should.equal(false);
      ngWordValidator.isIncludeTargetWord(text7).should.equal(false);
    });
  });

  describe('createConfirmText', () => {
    const text = $(mockUIConstants.selector.commentTextArea).text();
    const expectedText = 'testmessage';

    it('returns confirm text', () => {
      const confirmText = ngWordValidator.createConfirmText(text);

      confirmText.includes(expectedText).should.equal(true);
    });
  });
});
