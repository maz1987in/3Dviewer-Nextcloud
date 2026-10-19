/**
 * Copy-time rewrite that lets the rhino3dm runtime run without `unsafe-eval`.
 *
 * `rhino3dm.js` is an emscripten/embind build with the default `DYNAMIC_EXECUTION=1`, so
 * its glue writes the JavaScript caller for every bound C++ function, and for every
 * C++-to-JavaScript call, as source text and compiles it with `new Function`. Nextcloud's
 * Content Security Policy forbids that and, from Nextcloud 34, an app cannot opt back in.
 * Rhino3dmLoader evaluates the glue inside a Web Worker, where the blocked compile
 * rejected the module's start-up and the loader waited for an answer that never came
 * (#204).
 *
 * This is the same repair `occt-no-eval.mjs` makes for the CAD runtime, written against
 * the newer emscripten that built rhino3dm 8.32.1: both eval sites are replaced with the
 * closure-based code emscripten ships for `DYNAMIC_EXECUTION=0`, mirroring the generated
 * text statement for statement. The wasm binary is untouched.
 *
 * Unlike the OCCT glue this file is not bundled. The loader fetches it as text and
 * concatenates it into its worker, so `copy-decoders.mjs` applies the rewrite when it
 * copies the file out of `node_modules`. Each replacement matches the published text
 * exactly and throws when it is not there, so a rhino3dm that reshapes its glue fails the
 * build instead of shipping a 3DM loader that hangs under a strict CSP.
 */

/**
 * `craftInvokerFunction`: the caller for a bound C++ function or method.
 *
 * The generated body, for a function of N arguments:
 *
 *     var destructors = [];                         // only when a stack is needed
 *     var thisWired = toClassParamWire(dtorStack, this);   // methods only
 *     var argIWired = toArgIWire(dtorStack, argI);
 *     var rv = invoker(fn, thisWired?, arg0Wired, …);
 *     runDestructors(destructors)  |  per-argument destructorFunction(argIWired)
 *     return fromRetWire(rv);                       // when it returns
 *
 * where `dtorStack` is the stack or `null`. Passing `null` when no stack is needed
 * matters: `toWireType` registers a free on a non-null stack, and the per-argument
 * destructor frees the same pointer, so a stack in both cases would free twice.
 */
const INVOKER = {
	find: 'let invokerFactory=createJsInvoker(argTypes,isClassMethodFunc,returns,isAsync);var invokerFn=invokerFactory(...closureArgs);',
	replace: 'var invokerFn=function(...args){'
		+ 'var destructors=needsDestructorStack?[]:null;'
		+ 'var thisWired;'
		+ 'var argsWired=[];'
		+ 'if(isClassMethodFunc){thisWired=instType.toWireType(destructors,this)}'
		+ 'for(var i=2;i<argCount;++i){argsWired.push(argTypes[i].toWireType(destructors,args[i-2]))}'
		+ 'var rv=isClassMethodFunc?cppInvokerFunc(cppTargetFunc,thisWired,...argsWired):cppInvokerFunc(cppTargetFunc,...argsWired);'
		+ 'if(needsDestructorStack){runDestructors(destructors)}'
		+ 'else{for(var i=isClassMethodFunc?1:2;i<argTypes.length;++i){'
		+ 'if(argTypes[i].destructorFunction!==null){argTypes[i].destructorFunction(i===1?thisWired:argsWired[i-2])}}}'
		+ 'if(returns){return retType.fromWireType(rv)}'
		+ '};',
}

/**
 * `createJsInvoker` only produced the source text for the invoker above, and nothing
 * calls it once that is replaced. Its compile is turned into a throw so no `new Function`
 * survives in the file, and so a future caller fails loudly rather than under the CSP.
 */
const INVOKER_FACTORY = {
	find: 'invokerFnBody+="}\\n";return new Function(args1,invokerFnBody)}',
	replace: 'invokerFnBody+="}\\n";throw new Error("rhino3dm-no-eval: createJsInvoker is disabled")}',
}

/**
 * `__emval_create_invoker`: the caller C++ uses to reach JavaScript. Arguments are read
 * from consecutive 8-byte slots. `kind` picks the call: 0 calls the value, 1 calls a
 * method on it, 2 constructs it, and 3 is the generated `(a, b, …)` — a comma expression,
 * which evaluates to its last argument.
 */
const METHOD_CALLER = {
	find: /var captures=\{toValue:Emval\.toValue\};.*?var invokerFunction=new Function\(Object\.keys\(captures\),functionBody\)\(\.\.\.Object\.values\(captures\)\);/s,
	replace: 'var invokerFunction=function(handle,methodName,destructorsRef,args){'
		+ 'var argN=argFromPtr.map((read,i)=>read(args+i*GenericWireTypeSize));'
		+ 'var rv;'
		+ 'switch(kind){'
		+ 'case 0:rv=Emval.toValue(handle)(...argN);break;'
		+ 'case 2:rv=new(Emval.toValue(handle))(...argN);break;'
		+ 'case 3:rv=argN[argN.length-1];break;'
		+ 'case 1:rv=Emval.toValue(handle)[getStringOrSymbol(methodName)](...argN);break'
		+ '}'
		+ 'if(!retType.isVoid){return emval_returnValue(toReturnWire,destructorsRef,rv)}'
		+ '};',
}

/**
 * Replace the glue's `new Function` sites with closures.
 *
 * @param {string} code - Source of `rhino3dm/rhino3dm.js`
 * @return {string} the same glue, free of dynamic code generation
 * @throws {Error} when a site is missing, or one survives the rewrite
 */
export function stripDynamicExecution(code) {
	let out = code
	for (const { find, replace } of [INVOKER, INVOKER_FACTORY, METHOD_CALLER]) {
		const next = out.replace(find, () => replace)
		if (next === out) {
			throw new Error(
				'rhino3dm-no-eval: the rhino3dm glue no longer contains an eval site this rewrite '
				+ 'expects. The dependency changed shape; update scripts/rhino3dm-no-eval.mjs against '
				+ 'the new glue before building, or 3DM files will hang under Nextcloud\'s CSP.',
			)
		}
		out = next
	}
	if (/new Function\b|\beval\(/.test(out)) {
		throw new Error('rhino3dm-no-eval: the rhino3dm glue still compiles code from text after the rewrite.')
	}
	return out
}
