/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import {getFileSystem, PathManipulation} from '@angular/compiler-cli/private/localize';
import {ɵParsedTranslation} from '@angular/localize';

import {NodePath, PluginObj, types as t} from '../../babel_core';
import {Diagnostics} from '../../diagnostics';
import {buildCodeFrameError, buildLocalizeReplacement, isBabelParseError, isLocalize, translate, TranslatePluginOptions, unwrapMessagePartsFromTemplateLiteral} from '../../source_file_utils';

/**
 * Create a Babel plugin that can be used to do compile-time translation of `$localize` tagged
 * messages.
 *
 * 创建一个 Babel 插件，可用于对 `$localize` 标记消息进行编译时翻译。
 *
 * @publicApi used by CLI
 */
export function makeEs2015TranslatePlugin(
    diagnostics: Diagnostics, translations: Record<string, ɵParsedTranslation>,
    {missingTranslation = 'error', localizeName = '$localize'}: TranslatePluginOptions = {},
    fs: PathManipulation = getFileSystem()): PluginObj {
  return {
    visitor: {
      TaggedTemplateExpression(path: NodePath<t.TaggedTemplateExpression>) {
        try {
          const tag = path.get('tag');
          if (isLocalize(tag, localizeName)) {
            const [messageParts] =
                unwrapMessagePartsFromTemplateLiteral(path.get('quasi').get('quasis'), fs);
            const translated = translate(
                diagnostics, translations, messageParts, path.node.quasi.expressions,
                missingTranslation);
            path.replaceWith(buildLocalizeReplacement(translated[0], translated[1]));
          }
        } catch (e) {
          if (isBabelParseError(e)) {
            // If we get a BabelParseError here then something went wrong with Babel itself
            // since there must be something wrong with the structure of the AST generated
            // by Babel parsing a TaggedTemplateExpression.
            throw buildCodeFrameError(fs, path, e);
          } else {
            throw e;
          }
        }
      }
    }
  };
}
