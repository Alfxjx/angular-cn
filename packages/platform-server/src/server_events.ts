/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import {DOCUMENT, ɵgetDOM as getDOM} from '@angular/common';
import {Inject, Injectable} from '@angular/core';

@Injectable()
export class ServerEventManagerPlugin /* extends EventManagerPlugin which is private */ {
  constructor(@Inject(DOCUMENT) private doc: any) {}

  // Handle all events on the server.
  supports(eventName: string) {
    return true;
  }

  addEventListener(element: HTMLElement, eventName: string, handler: Function): Function {
    return getDOM().onAndCancel(element, eventName, handler);
  }

  /**
   * @deprecated
   *
   * No longer being used in Ivy code. To be removed in version 14.
   *
   * 不再在 Ivy 代码中使用。要在版本 14 中删除。
   *
   */
  addGlobalEventListener(element: string, eventName: string, handler: Function): Function {
    const target: HTMLElement = getDOM().getGlobalEventTarget(this.doc, element);
    if (!target) {
      throw new Error(`Unsupported event target ${target} for event ${eventName}`);
    }
    return this.addEventListener(target, eventName, handler);
  }
}
