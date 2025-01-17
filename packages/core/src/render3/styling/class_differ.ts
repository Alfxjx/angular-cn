/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import {assertNotEqual} from '../../util/assert';
import {CharCode} from '../../util/char_code';


/**
 * Returns an index of `classToSearch` in `className` taking token boundaries into account.
 *
 * 考虑标记边界，返回 `className` 中 `classToSearch` 的索引。
 *
 * `classIndexOf('AB A', 'A', 0)` will be 3 (not 0 since `AB!==A`)
 *
 * `classIndexOf('AB A', 'A', 0)` 将是 3（不是 0，因为 `AB!==A`）
 *
 * @param className A string containing classes (whitespace separated)
 *
 * 包含类的字符串（空格分隔）
 *
 * @param classToSearch A class name to locate
 *
 * 要定位的类名
 *
 * @param startingIndex Starting location of search
 *
 * 搜索的开始位置
 *
 * @returns
 *
 * an index of the located class (or -1 if not found)
 *
 * 定位的类的索引（如果找不到，则为 -1）
 *
 */
export function classIndexOf(
    className: string, classToSearch: string, startingIndex: number): number {
  ngDevMode && assertNotEqual(classToSearch, '', 'can not look for "" string.');
  let end = className.length;
  while (true) {
    const foundIndex = className.indexOf(classToSearch, startingIndex);
    if (foundIndex === -1) return foundIndex;
    if (foundIndex === 0 || className.charCodeAt(foundIndex - 1) <= CharCode.SPACE) {
      // Ensure that it has leading whitespace
      const length = classToSearch.length;
      if (foundIndex + length === end ||
          className.charCodeAt(foundIndex + length) <= CharCode.SPACE) {
        // Ensure that it has trailing whitespace
        return foundIndex;
      }
    }
    // False positive, keep searching from where we left off.
    startingIndex = foundIndex + 1;
  }
}
