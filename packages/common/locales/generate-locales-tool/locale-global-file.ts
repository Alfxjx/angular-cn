/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import {CldrLocaleData} from './cldr-data';
import {fileHeader} from './file-header';
import {BaseCurrencies} from './locale-base-currencies';
import {generateDayPeriodsSupplementalString} from './locale-extra-file';
import {generateBasicLocaleString} from './locale-file';
import {getPluralFunction} from './plural-function';

/**
 * Generated the contents for the global locale file
 *
 * 生成了全局区域设置文件的内容
 *
 */
export function generateLocaleGlobalFile(
    locale: string, localeData: CldrLocaleData, baseCurrencies: BaseCurrencies) {
  const basicLocaleData = generateBasicLocaleString(locale, localeData, baseCurrencies);
  const extraLocaleData = generateDayPeriodsSupplementalString(locale, localeData);
  const data = basicLocaleData.replace(/\]$/, `, ${extraLocaleData}]`);
  return `${fileHeader}
  (function(global) {
    global.ng = global.ng || {};
    global.ng.common = global.ng.common || {};
    global.ng.common.locales = global.ng.common.locales || {};
    const u = undefined;
    ${getPluralFunction(localeData, false)}
    global.ng.common.locales['${normalizeLocale(locale)}'] = ${data};
  })(typeof globalThis !== 'undefined' && globalThis || typeof global !== 'undefined' && global || typeof window !== 'undefined' && window);
    `;
}


/**
 * In Angular the locale is referenced by a "normalized" form.
 *
 * 在 Angular 中，区域设置由“规范化”形式引用。
 *
 */
function normalizeLocale(locale: string): string {
  return locale.toLowerCase().replace(/_/g, '-');
}
