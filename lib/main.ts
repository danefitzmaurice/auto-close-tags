import {
  CompositeDisposable,
  Disposable,
  TextEditor,
  Range,
  Point
} from 'atom';

import { config, AutoCloseTagsConfig } from './config';

/** ... */
interface TextInsertedEvent {
  text: string;
  range: Range;
}

/**
 * ...
 */
class AutoCloseTags {
  subscriptions: CompositeDisposable | null = null;
  currentEditor: TextEditor | null = null;
  action: Disposable | null = null;
  extension: string | null = null;
  config = createSettingsConfig();

  /**
   * ...
   */
  get tabLength() {
    return atom.config.get('editor.tabLength');
  }

  /**
   * ...
   */
  get tabType() {
    return atom.config.get('editor.tabType');
  }

  /**
   * ...
   */
  get currentBuffer() {
    if (!this.currentEditor) {
      throw new Error('');
    }

    return this.currentEditor.getBuffer();
  }

  /**
   * ...
   *
   * @param packageName ...
   * @param configKeys ...
   */
  observeConfig(
    packageName: string,
    configKeys: (keyof AutoCloseTagsConfig)[] = []
  ) {
    for (const key of configKeys) {
      const keyPath = `${packageName}.${key}`;

      atom.config.observe(keyPath, val => setConfigValue(key, val));
    }
  }

  /**
   * ...
   */
  activate() {
    this.subscriptions = new CompositeDisposable();

    this.observeConfig('auto-close-tags', [
      'enabledFileTypes',
      'selfCloseTags',
      'addSlashToSelfCloseTag',
      'slashTriggerAutoClose',
      'insertWhitespaceOnClose'
    ]);

    this.getFileExtension();
    this.currentEditor = atom.workspace.getActiveTextEditor() ?? null;

    if (this.currentEditor) {
      this.action = this.currentEditor.onDidInsertText(event => {
        this.closeTag(event);
      });
    }

    atom.workspace.onDidChangeActivePaneItem(paneItem => {
      this.paneItemChanged(paneItem);
    });
  }

  /**
   * ...
   */
  deactivate() {
    if (this.action) {
      this.action.disposalAction?.();
    }

    if (this.subscriptions) {
      this.subscriptions.dispose();
    }
  }

  /**
   * ...
   *
   * @param text ...
   * @param row ...
   * @return ...
   */
  getTextBefore(text: string, row: number) {
    if (!this.currentEditor) {
      throw new Error('');
    }

    let multiRow = false;

    while (!this.hasOddLeftBrackets(text) && row > 0) {
      row--;
      multiRow = true;
      text = this.currentBuffer.getLines()[row] + text;
    }

    return { str: text, multiRow };
  }

  /**
   * ...
   *
   * @param text ...
   * @return ...
   */
  hasOddLeftBrackets(text: string) {
    return text.replace(/[^<]/g, '').length % 2 !== 0;
  }

  /**
   * ...
   */
  autocloseDisabled() {
    return this.extension && !config.enabledFileTypes.includes(this.extension);
  }

  /**
   * ...
   */
  getTagName(str: string) {
    if (!str.includes('<')) return null;

    const match = str.match(/^.*\<([a-zA-Z-_.#@]+)[^>]*?/);

    return match ? match[1] : null;
  }

  /**
   * When users sype...
   *
   * @param strBefore String before the current character.
   * @param indentSize The indent size of the tag beginning part.
   */
  dealSlash(range: Range, strBefore: string, indentSize: number) {
    if (!this.currentEditor) {
      throw new Error('');
    }

    const line = this.currentBuffer.getLines()[range.end.row];
    this.backspaceIfNeeded(range, strBefore, indentSize);

    if (line.substr(range.end.column, 1) === '>' || hasOddQuots(strBefore)) {
      return;
    }

    this.currentEditor.backspace();

    this.closeSelfTag(strBefore);
  }

  /**
   * When users type...
   *
   * @param strBefore String before the current charactor.
   * @param indentSize The indent size of the tag beginning part.
   */
  dealRightAngleBracket(
    range: Range,
    strBefore: string,
    indentSize: number,
    tagName: string
  ) {
    if (!this.currentEditor) {
      throw new Error('');
    }

    const tempBefore = trimRight(strBefore);

    if (tempBefore[tempBefore.length - 1] === '/') return;

    this.backspaceIfNeeded(range, strBefore, indentSize);

    if (isSelfcloseTag(strBefore)) {
      this.currentEditor.backspace();

      return this.closeSelfTag(strBefore);
    }

    this.currentEditor.insertText(`</${tagName}>`);
    this.currentEditor.moveLeft(tagName.length + 3);
  }

  /**
   * ...
   *
   * @param range ...
   * @param strBefore ...
   * @return ...
   */
  dealExclamationMark(range: Range, strBefore: string) {
    if (!this.currentEditor) {
      throw new Error('');
    }

    if (range.end.row === 0) {
      return;
      // <!DOCTYPE html>
    }

    if (/<$/.test(strBefore)) {
      this.currentEditor.insertText(`--  -->`);
      const rightPartLen = ' -->'.length;
      this.currentEditor.moveLeft(rightPartLen);
    }
  }

  /**
   * ...
   *
   * @param range ...
   * @param strBefore ...
   * @param indentSize ...
   * @return ...
   */
  backspaceIfNeeded(range: Range, strBefore: string, indentSize: number) {
    if (this.endsWithSpaces(strBefore, indentSize)) {
      this.backIndent(range, indentSize);
    }
  }

  /**
   * ...
   *
   * @param range ...
   * @param indentSize ...
   * @return ...
   */
  backIndent(range: Range, indentSize: number) {
    if (!this.currentEditor) {
      throw new Error('');
    }

    if (!indentSize) return;

    // ...
    const backDistance = range.end.column - indentSize - 1;

    if (!backDistance) return;

    this.currentEditor.moveLeft(1);
    this.currentEditor.backspace();
    this.currentEditor.moveRight(1);
  }

  /**
   * ...
   *
   * @param leftPart ...
   * @param indentSize ...
   * @return ...
   */
  endsWithSpaces(leftPart: string, indentSize: number) {
    // ...
    const expectedStr = ' '.repeat(indentSize);

    return expectedStr === leftPart.slice(leftPart.length - indentSize);
  }

  /**
   * ...
   *
   * @param strBefore ...
   * @return ...
   */
  closeSelfTag(strBefore: string) {
    if (!this.currentEditor) {
      throw new Error('');
    }

    // ...
    const closePart = config.addSlashToSelfCloseTag ? '/>' : '>';

    if (strBefore[strBefore.length - 1] === ' ') {
      this.currentEditor.insertText(closePart);

      return;
    }

    if (config.insertWhitespaceOnClose) {
      this.currentEditor.insertText(' ' + closePart);

      return;
    }

    this.currentEditor.insertText(closePart + ' ');
    this.currentEditor.backspace();
  }

  // region Private Methods

  /**
   * ...
   *
   * @return ...
   */
  private getIndentStr() {
    return (this.tabType === 'hard' ? '\t' : '').repeat(this.tabLength);
  }

  /**
   * ...
   *
   * @return ...
   */
  private getFileExtension() {
    // ...
    let filename = !this.currentEditor ? null : this.currentEditor.getTitle();

    this.extension = null;

    if (filename && filename.includes('.')) {
      this.extension = filename.split('.').pop() ?? null;
    }

    return this.extension;
  }

  /**
   * ...
   *
   * @param paneItem ...
   */
  private paneItemChanged(paneItem: unknown) {
    if (!paneItem) return;

    if (this.action) {
      this.action.disposalAction?.();
    }

    this.currentEditor = paneItem as TextEditor;
    this.getFileExtension();

    if (this.autocloseDisabled()) return;

    if (this.currentEditor.onDidInsertText) {
      this.action = this.currentEditor.onDidInsertText(this.closeTag);
    }
  }

  /**
   * ...
   *
   * @param point ...
   * @return ...
   */
  private getSyntaxTreeAtPoint(point: Point) {
    if (!this.currentEditor) {
      throw new Error('[AutoCloseTags] ...');
    }

    // ...
    const scopes = this.currentEditor
      .syntaxTreeScopeDescriptorForBufferPosition(point)
      .getScopesArray();

    return [...scopes];
  }

  /**
   * Check if a given buffer range within the current text editor is embedded
   * within markup as recognized by the current grammar scope.
   *
   * @param range Buffer range to check.
   * @return `true` if the range is within markup, otherwise `false`.
   */
  private isBufferWithinMarkup(range: Range) {
    if (!this.currentEditor) {
      throw new Error('[AutoCloseTags] ...');
    }

    const { scopeName } = this.currentEditor.getGrammar();

    // ...
    let startScopes = this.getSyntaxTreeAtPoint(range.start);
    let endScopes = this.getSyntaxTreeAtPoint(range.end);

    // console.log('scopes:', { startScopes, endScopes });

    // ...
    if (scopeName === 'source.jsx' || scopeName === 'source.tsx') {
      startScopes = getLocalJsxElementSyntaxTree(startScopes);
      endScopes = getLocalJsxElementSyntaxTree(endScopes);

      // console.log({ startScopes, endScopes });

      // Must be within a "jsx_element" scope.
      if (!startScopes.includes('jsx_element')) return false;
      // Must not be ...
      if (startScopes.includes('jsx_text')) return false;

      return true;
    }

    // ...
    if (scopeName === 'text.html.vue') {
      return startScopes.includes('meta.tag.block.any.html');
    }

    return true;
  }

  /**
   * ...
   *
   * @param range ...
   */
  private addIndent(range: Range) {
    if (!this.currentEditor) {
      throw new Error('');
    }

    const start = range.start;
    const end = range.end;
    const buffer = this.currentBuffer;
    const lineBefore = buffer.getLines()[start.row];
    const lineAfter = buffer.getLines()[end.row];
    const content =
      lineBefore.substr(lineBefore.lastIndexOf('<')) + '\n' + lineAfter;
    const regex = /^.*\<([a-zA-Z-_]+)(\s.+)?\>\n\s*\<\/\1\>.*/;
    const indentStr = this.getIndentStr();

    if (regex.test(content)) {
      this.currentEditor.insertNewlineAbove();
      this.currentEditor.insertText(indentStr);

      return;
    }

    const attrNewLineReg = /^.*\<([a-zA-Z-SÍ_]+)[^>]*\n\s*[^>]*$/;

    if (attrNewLineReg.test(content)) {
      this.currentEditor.insertText(indentStr);
    }
  }

  /**
   * ...
   */
  private closeTag = (event: unknown) => {
    if (!this.currentEditor) {
      throw new Error('[AutoCloseTags] ...');
    }

    // ...
    if (!isTextInsertedEvent(event)) return;

    const { text, range } = event;

    // ...
    if (!this.isBufferWithinMarkup(range)) return;

    if (text === '\n') {
      return this.addIndent(event.range);
    }

    if (!['>', '/', '!'].includes(text)) return;

    const line = this.currentBuffer.getLines()[range.end.row];
    const lineLeft = line.slice(0, range.end.column - 1);
    const { str, multiRow } = this.getTextBefore(lineLeft, range.end.row);
    const strBefore = str;

    // ...
    const indentSize = !multiRow
      ? 0
      : (strBefore.match(/^\s*/) ?? [])[0].length;

    const tagName = this.getTagName(strBefore);

    if (text === '!') {
      return this.dealExclamationMark(range, strBefore);
    }

    if (!tagName || isOpenedCondition(strBefore)) return;

    if (text === '>') {
      return this.dealRightAngleBracket(range, strBefore, indentSize, tagName);
    }

    if (text === '/' && config.slashTriggerAutoClose) {
      this.dealSlash(range, strBefore, indentSize);
    }
  };

  // endregion Private Methods
}

/** ... */
export default new AutoCloseTags();

// region Helper Functions

/**
 * Ensure the provided value is a `TextInsertedEvent`.
 *
 * @param value Value to check.
 * @return `true` if the value is a `TextInsertedEvent`, otherwise `false`.
 */
function isTextInsertedEvent(value: unknown): value is TextInsertedEvent {
  return (
    typeof (value as TextInsertedEvent).text === 'string' &&
    (value as TextInsertedEvent).range instanceof Range
  );
}

/**
 * ...
 *
 * @param str ...
 * @return ...
 */
function hasOddQuots(str: string) {
  const singleQuots = str.match(/'/g);
  const doubleQuots = str.match(/"/g);

  let ret = 0;

  if (singleQuots) {
    ret += singleQuots.length;
  }

  if (doubleQuots) {
    ret += doubleQuots.length;
  }

  return ret % 2 === 1;
}

/**
 * ...
 *
 * @param str ...
 * @return ...
 */
function trimRight(str: string) {
  return str.replace(/\s+$/, '');
}

/**
 * ...
 *
 * @param str ...
 * @return ...
 */
function isSelfcloseTag(str: string) {
  const tagName = findTagName(str);

  if (!tagName || !tagName.toLowerCase()) return;

  return config.selfCloseTags.some(tag => tag.toLowerCase() === tagName);
}

/**
 * ...
 *
 * @param str ...
 * @return ...
 */
function findTagName(str: string) {
  const tokens = str.split('<');

  if (!tokens.length) return '';

  const currentTagLeft = tokens[tokens.length - 1];
  const currentTagName = currentTagLeft.split(' ')[0];

  return currentTagName && currentTagName.toLowerCase();
}

/**
 * ...
 *
 * @param str ...
 * @return ...
 */
function isOpenedCondition(str: string) {
  return /{[^}]*$/.test(str);
}

/**
 * ...
 *
 * @return ...
 */
function createSettingsConfig() {
  // ...
  return {
    enabledFileTypes: {
      type: 'array',
      default: config.enabledFileTypes,
      description:
        'Enable autoclose in these file types, default file type is `html`. (comma split)'
    },
    selfCloseTags: {
      type: 'array',
      default: config.selfCloseTags,
      description:
        'Self-close tags, will not add the right part when type `>`. (comma split)'
    },
    slashTriggerAutoClose: {
      type: 'boolean',
      default: config.slashTriggerAutoClose,
      description: 'Trigger auto close when type a `/`'
    },
    addSlashToSelfCloseTag: {
      type: 'boolean',
      default: config.addSlashToSelfCloseTag,
      description: 'Automatically add a `/` when close the self-close tag'
    },
    insertWhitespaceOnClose: {
      type: 'boolean',
      default: config.insertWhitespaceOnClose,
      description: 'Add a whitespace before `>` when close the self-close tag'
    }
  };
}

/**
 * ...
 *
 * @param key ...
 * @param value ...
 */
function setConfigValue(key: keyof AutoCloseTagsConfig, value: unknown) {
  let isValidValue = false;

  if (key === 'enabledFileTypes') {
    isValidValue = Array.isArray(value);
  } else if (key === 'selfCloseTags') {
    isValidValue = Array.isArray(value);
  } else if (key === 'addSlashToSelfCloseTag') {
    isValidValue = typeof value === 'boolean';
  } else if (key === 'slashTriggerAutoClose') {
    isValidValue = typeof value === 'boolean';
  } else if (key === 'insertWhitespaceOnClose') {
    isValidValue = typeof value === 'boolean';
  }

  if (!isValidValue) {
    throw new Error('[]');
  }

  config[key] = value as any;
}

/**
 * ...
 *
 * @param scopes ...
 * @return ...
 */
function getLocalJsxElementSyntaxTree(scopes: string[]) {
  // ...
  const i = scopes.lastIndexOf('jsx_element');

  return i === -1 ? [] : scopes.slice(i);
}

// endregion Helper Functions
