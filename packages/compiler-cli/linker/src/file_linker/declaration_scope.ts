/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

/**
 * This interface represents the lexical scope of a partial declaration in the source code.
 *
 * 此接口表示源代码中部分声明的词法范围。
 *
 * For example, if you had the following code:
 *
 * 例如，如果你有以下代码：
 *
 * ```
 * function foo() {
 *   function bar () {
 *     ɵɵngDeclareDirective({...});
 *   }
 * }
 * ```
 *
 * The `DeclarationScope` of the `ɵɵngDeclareDirective()` call is the body of the `bar()` function.
 *
 * `ɵɵngDeclareDirective()` 调用的 `DeclarationScope` 是 `bar()` 函数的主体。
 *
 * The `FileLinker` uses this object to identify the lexical scope of any constant statements that
 * might be generated by the linking process (i.e. where the `ConstantPool` lives for a set of
 * partial linkers).
 *
 * `FileLinker` 使用此对象来标识链接过程可能生成的任何常量语句的词法范围（即，`ConstantPool`
 * 为一组部分链接器而存在的地方）。
 *
 */
export interface DeclarationScope<TSharedConstantScope, TExpression> {
  /**
   * Get a `TSharedConstantScope` object that can be used to reference the lexical scope where any
   * shared constant statements would be inserted.
   *
   * 获取一个 `TSharedConstantScope` 对象，该对象可用于引用将插入任何共享常量语句的词法范围。
   *
   * This object is generic because different AST implementations will need different
   * `TConstantScope` types to be able to insert shared constant statements. For example in Babel
   * this would be a `NodePath` object; in TS it would just be a `Node` object.
   *
   * 此对象是通用的，因为不同的 AST 实现将需要不同 `TConstantScope`
   * 类型才能插入共享常量语句。例如，在 Babel 中，这将是一个 `NodePath` 对象；在 TS 中，它只是一个
   * `Node` 对象。
   *
   * If it is not possible to find such a shared scope, then constant statements will be wrapped up
   * with their generated linked definition expression, in the form of an IIFE.
   *
   * 如果找不到这样的共享范围，则常量语句将使用它们生成的链接定义表达式，以 IIFE 的形式包装。
   *
   * @param expression the expression that points to the Angular core framework import.
   *
   * 指向 Angular 核心框架导入的表达式。
   *
   * @returns
   *
   * a reference to a reference object for where the shared constant statements will be
   *     inserted, or `null` if it is not possible to have a shared scope.
   *
   * 对将插入共享常量语句的引用对象的引用，如果不可能有共享范围，则为 `null` 。
   *
   */
  getConstantScopeRef(expression: TExpression): TSharedConstantScope|null;
}
