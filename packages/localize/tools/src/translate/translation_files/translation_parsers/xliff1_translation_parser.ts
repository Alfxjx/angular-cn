/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import {Element, ParseErrorLevel, visitAll} from '@angular/compiler';

import {Diagnostics} from '../../../diagnostics';
import {BaseVisitor} from '../base_visitor';

import {serializeTranslationMessage} from './serialize_translation_message';
import {ParseAnalysis, ParsedTranslationBundle, TranslationParser} from './translation_parser';
import {addErrorsToBundle, addParseDiagnostic, addParseError, canParseXml, getAttribute, isNamedElement, XmlTranslationParserHint} from './translation_utils';

/**
 * A translation parser that can load XLIFF 1.2 files.
 *
 * 可以加载 XLIFF 1.2 文件的翻译解析器。
 *
 * <https://docs.oasis-open.org/xliff/v1.2/os/xliff-core.html>
 * <https://docs.oasis-open.org/xliff/v1.2/xliff-profile-html/xliff-profile-html-1.2.html>
 *
 * <https://docs.oasis-open.org/xliff/v1.2/os/xliff-core.html>
 * [https://docs.oasis-open.org/xliff/v1.2/xliff-profile-html/xliff
 * -profile-html-1.2.html](https://docs.oasis-open.org/xliff/v1.2/xliff-profile-html/xliff-profile-html-1.2.html)
 *
 * @see Xliff1TranslationSerializer
 * @publicApi used by CLI
 */
export class Xliff1TranslationParser implements TranslationParser<XmlTranslationParserHint> {
  /**
   * @deprecated
   */
  canParse(filePath: string, contents: string): XmlTranslationParserHint|false {
    const result = this.analyze(filePath, contents);
    return result.canParse && result.hint;
  }

  analyze(filePath: string, contents: string): ParseAnalysis<XmlTranslationParserHint> {
    return canParseXml(filePath, contents, 'xliff', {version: '1.2'});
  }

  parse(filePath: string, contents: string, hint?: XmlTranslationParserHint):
      ParsedTranslationBundle {
    if (hint) {
      return this.extractBundle(hint);
    } else {
      return this.extractBundleDeprecated(filePath, contents);
    }
  }

  private extractBundle({element, errors}: XmlTranslationParserHint): ParsedTranslationBundle {
    const diagnostics = new Diagnostics();
    errors.forEach(e => addParseError(diagnostics, e));

    if (element.children.length === 0) {
      addParseDiagnostic(
          diagnostics, element.sourceSpan, 'Missing expected <file> element',
          ParseErrorLevel.WARNING);
      return {locale: undefined, translations: {}, diagnostics};
    }

    const files = element.children.filter(isNamedElement('file'));
    if (files.length === 0) {
      addParseDiagnostic(
          diagnostics, element.sourceSpan, 'No <file> elements found in <xliff>',
          ParseErrorLevel.WARNING);
    } else if (files.length > 1) {
      addParseDiagnostic(
          diagnostics, files[1].sourceSpan, 'More than one <file> element found in <xliff>',
          ParseErrorLevel.WARNING);
    }

    const bundle: ParsedTranslationBundle = {locale: undefined, translations: {}, diagnostics};
    const translationVisitor = new XliffTranslationVisitor();
    const localesFound = new Set<string>();
    for (const file of files) {
      const locale = getAttribute(file, 'target-language');
      if (locale !== undefined) {
        localesFound.add(locale);
        bundle.locale = locale;
      }
      visitAll(translationVisitor, file.children, bundle);
    }

    if (localesFound.size > 1) {
      addParseDiagnostic(
          diagnostics, element.sourceSpan,
          `More than one locale found in translation file: ${
              JSON.stringify(Array.from(localesFound))}. Using "${bundle.locale}"`,
          ParseErrorLevel.WARNING);
    }

    return bundle;
  }

  private extractBundleDeprecated(filePath: string, contents: string) {
    const hint = this.canParse(filePath, contents);
    if (!hint) {
      throw new Error(`Unable to parse "${filePath}" as XLIFF 1.2 format.`);
    }
    const bundle = this.extractBundle(hint);
    if (bundle.diagnostics.hasErrors) {
      const message =
          bundle.diagnostics.formatDiagnostics(`Failed to parse "${filePath}" as XLIFF 1.2 format`);
      throw new Error(message);
    }
    return bundle;
  }
}

class XliffFileElementVisitor extends BaseVisitor {
  override visitElement(fileElement: Element): any {
    if (fileElement.name === 'file') {
      return {fileElement, locale: getAttribute(fileElement, 'target-language')};
    }
  }
}

class XliffTranslationVisitor extends BaseVisitor {
  override visitElement(element: Element, bundle: ParsedTranslationBundle): void {
    if (element.name === 'trans-unit') {
      this.visitTransUnitElement(element, bundle);
    } else {
      visitAll(this, element.children, bundle);
    }
  }

  private visitTransUnitElement(element: Element, bundle: ParsedTranslationBundle): void {
    // Error if no `id` attribute
    const id = getAttribute(element, 'id');
    if (id === undefined) {
      addParseDiagnostic(
          bundle.diagnostics, element.sourceSpan,
          `Missing required "id" attribute on <trans-unit> element.`, ParseErrorLevel.ERROR);
      return;
    }

    // Error if there is already a translation with the same id
    if (bundle.translations[id] !== undefined) {
      addParseDiagnostic(
          bundle.diagnostics, element.sourceSpan, `Duplicated translations for message "${id}"`,
          ParseErrorLevel.ERROR);
      return;
    }

    let targetMessage = element.children.find(isNamedElement('target'));
    if (targetMessage === undefined) {
      // Warn if there is no `<target>` child element
      addParseDiagnostic(
          bundle.diagnostics, element.sourceSpan, 'Missing <target> element',
          ParseErrorLevel.WARNING);

      // Fallback to the `<source>` element if available.
      targetMessage = element.children.find(isNamedElement('source'));
      if (targetMessage === undefined) {
        // Error if there is neither `<target>` nor `<source>`.
        addParseDiagnostic(
            bundle.diagnostics, element.sourceSpan,
            'Missing required element: one of <target> or <source> is required',
            ParseErrorLevel.ERROR);
        return;
      }
    }

    const {translation, parseErrors, serializeErrors} = serializeTranslationMessage(targetMessage, {
      inlineElements: ['g', 'bx', 'ex', 'bpt', 'ept', 'ph', 'it', 'mrk'],
      placeholder: {elementName: 'x', nameAttribute: 'id'}
    });
    if (translation !== null) {
      bundle.translations[id] = translation;
    }
    addErrorsToBundle(bundle, parseErrors);
    addErrorsToBundle(bundle, serializeErrors);
  }
}
