/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import {computeDecimalDigest, computeDigest, decimalDigest} from '../../../i18n/digest';
import * as i18n from '../../../i18n/i18n_ast';
import {createI18nMessageFactory, VisitNodeFn} from '../../../i18n/i18n_parser';
import {I18nError} from '../../../i18n/parse_util';
import * as html from '../../../ml_parser/ast';
import {DEFAULT_INTERPOLATION_CONFIG, InterpolationConfig} from '../../../ml_parser/interpolation_config';
import {ParseTreeResult} from '../../../ml_parser/parser';
import * as o from '../../../output/output_ast';
import {isTrustedTypesSink} from '../../../schema/trusted_types_sinks';

import {hasI18nAttrs, I18N_ATTR, I18N_ATTR_PREFIX, icuFromI18nMessage} from './util';

export type I18nMeta = {
  id?: string,
  customId?: string,
  legacyIds?: string[],
  description?: string,
  meaning?: string
};


const setI18nRefs: VisitNodeFn = (htmlNode, i18nNode) => {
  if (htmlNode instanceof html.NodeWithI18n) {
    if (i18nNode instanceof i18n.IcuPlaceholder && htmlNode.i18n instanceof i18n.Message) {
      // This html node represents an ICU but this is a second processing pass, and the legacy id
      // was computed in the previous pass and stored in the `i18n` property as a message.
      // We are about to wipe out that property so capture the previous message to be reused when
      // generating the message for this ICU later. See `_generateI18nMessage()`.
      i18nNode.previousMessage = htmlNode.i18n;
    }
    htmlNode.i18n = i18nNode;
  }
  return i18nNode;
};

/**
 * This visitor walks over HTML parse tree and converts information stored in
 * i18n-related attributes ("i18n" and "i18n-\*") into i18n meta object that is
 * stored with other element's and attribute's information.
 *
 * 此访问者会遍历 HTML 解析树，并将存储在 i18n 相关属性（“i18n”和“i18n-\*”）中的信息转换为 i18n
 * 元对象，该对象与其他元素和属性的信息一起存储。
 *
 */
export class I18nMetaVisitor implements html.Visitor {
  // whether visited nodes contain i18n information
  public hasI18nMeta: boolean = false;
  private _errors: I18nError[] = [];

  // i18n message generation factory
  private _createI18nMessage = createI18nMessageFactory(this.interpolationConfig);

  constructor(
      private interpolationConfig: InterpolationConfig = DEFAULT_INTERPOLATION_CONFIG,
      private keepI18nAttrs = false, private enableI18nLegacyMessageIdFormat = false) {}

  private _generateI18nMessage(
      nodes: html.Node[], meta: string|i18n.I18nMeta = '',
      visitNodeFn?: VisitNodeFn): i18n.Message {
    const {meaning, description, customId} = this._parseMetadata(meta);
    const message = this._createI18nMessage(nodes, meaning, description, customId, visitNodeFn);
    this._setMessageId(message, meta);
    this._setLegacyIds(message, meta);
    return message;
  }

  visitAllWithErrors(nodes: html.Node[]): ParseTreeResult {
    const result = nodes.map(node => node.visit(this, null));
    return new ParseTreeResult(result, this._errors);
  }

  visitElement(element: html.Element): any {
    let message: i18n.Message|undefined = undefined;

    if (hasI18nAttrs(element)) {
      this.hasI18nMeta = true;
      const attrs: html.Attribute[] = [];
      const attrsMeta: {[key: string]: string} = {};

      for (const attr of element.attrs) {
        if (attr.name === I18N_ATTR) {
          // root 'i18n' node attribute
          const i18n = element.i18n || attr.value;
          message = this._generateI18nMessage(element.children, i18n, setI18nRefs);
          if (message.nodes.length === 0) {
            // Ignore the message if it is empty.
            message = undefined;
          }
          // Store the message on the element
          element.i18n = message;
        } else if (attr.name.startsWith(I18N_ATTR_PREFIX)) {
          // 'i18n-*' attributes
          const name = attr.name.slice(I18N_ATTR_PREFIX.length);
          if (isTrustedTypesSink(element.name, name)) {
            this._reportError(
                attr, `Translating attribute '${name}' is disallowed for security reasons.`);
          } else {
            attrsMeta[name] = attr.value;
          }
        } else {
          // non-i18n attributes
          attrs.push(attr);
        }
      }

      // set i18n meta for attributes
      if (Object.keys(attrsMeta).length) {
        for (const attr of attrs) {
          const meta = attrsMeta[attr.name];
          // do not create translation for empty attributes
          if (meta !== undefined && attr.value) {
            attr.i18n = this._generateI18nMessage([attr], attr.i18n || meta);
          }
        }
      }

      if (!this.keepI18nAttrs) {
        // update element's attributes,
        // keeping only non-i18n related ones
        element.attrs = attrs;
      }
    }
    html.visitAll(this, element.children, message);
    return element;
  }

  visitExpansion(expansion: html.Expansion, currentMessage: i18n.Message|null): any {
    let message;
    const meta = expansion.i18n;
    this.hasI18nMeta = true;
    if (meta instanceof i18n.IcuPlaceholder) {
      // set ICU placeholder name (e.g. "ICU_1"),
      // generated while processing root element contents,
      // so we can reference it when we output translation
      const name = meta.name;
      message = this._generateI18nMessage([expansion], meta);
      const icu = icuFromI18nMessage(message);
      icu.name = name;
      if (currentMessage !== null) {
        // Also update the placeholderToMessage map with this new message
        currentMessage.placeholderToMessage[name] = message;
      }
    } else {
      // ICU is a top level message, try to use metadata from container element if provided via
      // `context` argument. Note: context may not be available for standalone ICUs (without
      // wrapping element), so fallback to ICU metadata in this case.
      message = this._generateI18nMessage([expansion], currentMessage || meta);
    }
    expansion.i18n = message;
    return expansion;
  }

  visitText(text: html.Text): any {
    return text;
  }
  visitAttribute(attribute: html.Attribute): any {
    return attribute;
  }
  visitComment(comment: html.Comment): any {
    return comment;
  }
  visitExpansionCase(expansionCase: html.ExpansionCase): any {
    return expansionCase;
  }

  /**
   * Parse the general form `meta` passed into extract the explicit metadata needed to create a
   * `Message`.
   *
   * 解析传入的一般形式的 `meta` 数据，以提取创建 `Message` 所需的显式元数据。
   *
   * There are three possibilities for the `meta` variable
   * 1) a string from an `i18n` template attribute: parse it to extract the metadata values.
   * 2) a `Message` from a previous processing pass: reuse the metadata values in the message.
   * 4) other: ignore this and just process the message metadata as normal
   *
   * `meta` 变量有三种可能性： 1）来自 `i18n` 模板属性的字符串：解析它以提取元数据值。
   * 2）来自前一个处理过程的 `Message` ：重用消息中的元数据值。
   * 4）其他：忽略它，并照常处理消息元数据
   *
   * @param meta the bucket that holds information about the message
   *
   * 保存有关消息的信息的存储桶
   *
   * @returns
   *
   * the parsed metadata.
   *
   * 解析后的元数据。
   *
   */
  private _parseMetadata(meta: string|i18n.I18nMeta): I18nMeta {
    return typeof meta === 'string'  ? parseI18nMeta(meta) :
        meta instanceof i18n.Message ? meta :
                                       {};
  }

  /**
   * Generate (or restore) message id if not specified already.
   *
   * 如果尚未指定，则生成（或恢复）消息 ID。
   *
   */
  private _setMessageId(message: i18n.Message, meta: string|i18n.I18nMeta): void {
    if (!message.id) {
      message.id = meta instanceof i18n.Message && meta.id || decimalDigest(message);
    }
  }

  /**
   * Update the `message` with a `legacyId` if necessary.
   *
   * 如有必要，使用 `legacyId` 更新 `message` 。
   *
   * @param message the message whose legacy id should be set
   *
   * 应该设置其旧版 ID 的消息
   *
   * @param meta information about the message being processed
   *
   * 有关正在处理的消息的信息
   *
   */
  private _setLegacyIds(message: i18n.Message, meta: string|i18n.I18nMeta): void {
    if (this.enableI18nLegacyMessageIdFormat) {
      message.legacyIds = [computeDigest(message), computeDecimalDigest(message)];
    } else if (typeof meta !== 'string') {
      // This occurs if we are doing the 2nd pass after whitespace removal (see `parseTemplate()` in
      // `packages/compiler/src/render3/view/template.ts`).
      // In that case we want to reuse the legacy message generated in the 1st pass (see
      // `setI18nRefs()`).
      const previousMessage = meta instanceof i18n.Message ? meta :
          meta instanceof i18n.IcuPlaceholder              ? meta.previousMessage :
                                                             undefined;
      message.legacyIds = previousMessage ? previousMessage.legacyIds : [];
    }
  }

  private _reportError(node: html.Node, msg: string): void {
    this._errors.push(new I18nError(node.sourceSpan, msg));
  }
}

/**
 * I18n separators for metadata
 *
 * 元数据的 I18n 分隔符
 *
 */
const I18N_MEANING_SEPARATOR = '|';
const I18N_ID_SEPARATOR = '@@';

/**
 * Parses i18n metas like:
 *
 * 解析 i18n 元，例如：
 *
 * - "@@id",
 *
 * - "description[@@id]",
 *
 *   “描述[@@id][@@id] ”，
 *
 * - "meaning|description[@@id]"
 *   and returns an object with parsed output.
 *
 *   “meaning|description [@@id][@@id] ” 并返回具有解析输出的对象。
 *
 * @param meta String that represents i18n meta
 *
 * 表示 i18n 元的字符串
 *
 * @returns
 *
 * Object with id, meaning and description fields
 *
 * 具有 id、meaning 和 description 字段的对象
 *
 */
export function parseI18nMeta(meta: string = ''): I18nMeta {
  let customId: string|undefined;
  let meaning: string|undefined;
  let description: string|undefined;

  meta = meta.trim();
  if (meta) {
    const idIndex = meta.indexOf(I18N_ID_SEPARATOR);
    const descIndex = meta.indexOf(I18N_MEANING_SEPARATOR);
    let meaningAndDesc: string;
    [meaningAndDesc, customId] =
        (idIndex > -1) ? [meta.slice(0, idIndex), meta.slice(idIndex + 2)] : [meta, ''];
    [meaning, description] = (descIndex > -1) ?
        [meaningAndDesc.slice(0, descIndex), meaningAndDesc.slice(descIndex + 1)] :
        ['', meaningAndDesc];
  }

  return {customId, meaning, description};
}

// Converts i18n meta information for a message (id, description, meaning)
// to a JsDoc statement formatted as expected by the Closure compiler.
export function i18nMetaToJSDoc(meta: I18nMeta): o.JSDocComment {
  const tags: o.JSDocTag[] = [];
  if (meta.description) {
    tags.push({tagName: o.JSDocTagName.Desc, text: meta.description});
  } else {
    // Suppress the JSCompiler warning that a `@desc` was not given for this message.
    tags.push({tagName: o.JSDocTagName.Suppress, text: '{msgDescriptions}'});
  }
  if (meta.meaning) {
    tags.push({tagName: o.JSDocTagName.Meaning, text: meta.meaning});
  }
  return o.jsDocComment(tags);
}
