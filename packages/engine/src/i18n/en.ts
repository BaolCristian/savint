/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// English messages for the error keys thrown by `math/`, `jme/`, `parts/`,
// `marking/` and `question/`. Same key set as
// `i18n/it.ts` — the two dictionaries must stay in sync (there is a test for
// it in test/unit/i18n.test.ts). Texts are rewritten for SAVINT, taking the
// upstream `locales/en-GB.json` entries only as a starting point; placeholders
// use the `{name}` form read by `t()`.

export const en: Record<string, string> = {
  // math.js, util.js — the 31 error keys thrown by `math/` (49 sites); the text is
  // the upstream en-GB catalogue's, verbatim. The two marked "ours" carry an
  // upstream key that has no upstream text.
  "math.choose.empty selection": "Empty selection given to random function",
  "math.combinations.complex": "Can't compute combinations of complex numbers",
  "math.combinations.k less than zero": "Can't compute combinations: k is less than zero",
  "math.combinations.n less than k": "Can't compute combinations: n is less than k",
  "math.combinations.n less than zero": "Can't compute combinations: n is less than zero",
  "math.gcf.complex": "Can't compute GCF of complex numbers",
  "math.lcm.complex": "Can't compute LCM of complex numbers",
  "math.niceNumber.undefined": "Was expecting a number, but got <code>undefined</code>",
  "math.order complex numbers": "Can't order complex numbers",
  "math.permutations.complex": "Can't compute permutations of complex numbers",
  "math.permutations.k less than zero": "Can't compute permutations: k is less than zero",
  "math.permutations.n less than k": "Can't compute permutations: n is less than k",
  "math.permutations.n less than zero": "Can't compute permutations: n is less than zero",
  "math.precround.complex": "Can't round to a complex number of decimal places",
  "math.random_integer_partition.invalid k": "The size of the partition must be between 1 and {n}.",
  "math.rangeToList.zero step size": "Can't convert a range with step size zero to a list.",
  "math.real interval.invalid string": "The string <code>{str}</code> is not a valid interval definition.",
  "math.shuffle_together.lists not all the same length": "Not all lists are the same length.",
  "math.siground.complex": "Can't round to a complex number of sig figs",
  "math.toNearest.complex": "Can't round to the nearest multiple of a complex number", // ours
  "matrixmath.abs.non-square": "Can't compute the determinant of a matrix which isn't square.",
  "matrixmath.abs.too big": "Sorry, can't compute the determinant of a matrix bigger than 3x3 yet.",
  "matrixmath.mul.different sizes": "Can't multiply matrices of different sizes.",
  "matrixmath.not invertible": "This operation only works on an invertible matrix.",
  "matrixmath.not square": "This operation only works on a square matrix.",
  "util.formatNumberNotation.unrecognised syntax":
    "The number formatting syntax <code>{syntax}</code> is not recognised.",
  "util.permutations.r bigger than n": "Can't take more elements than the list has.", // ours
  "util.product.non list": "Passed a non-list to <code>Numbas.util.product</code>",
  "vectormath.cross.matrix too big":
    "Can't calculate cross product of a matrix which isn't $1 \\times N$ or $N \\times 1$.",
  "vectormath.cross.not 3d": "Can only take the cross product of 3-dimensional vectors.",
  "vectormath.dot.matrix too big":
    "Can't calculate dot product of a matrix which isn't $1 \\times N$ or $N \\times 1$.",

  "jme.calculus.unknown derivative": "I don't know how to differentiate {tree}",
  "jme.compile list.mismatched bracket": "Mismatched brackets in the list of expressions",
  "jme.compile list.missing right bracket": "A closing bracket is missing in the list of expressions",
  "jme.display.collectRuleset.no sets": "Collecting a ruleset needs the list of the rulesets in scope",
  "jme.display.collectRuleset.set not defined": "The ruleset {name} is not defined",
  "jme.display.unknown token type": "Can't texify token type {type}",
  "jme.display.wrong number of arguments": "{name} is called with {count} arguments, a number no definition accepts",
  "jme.display.simplifyTree.stuck in a loop": "Simplifying {expr} got stuck in a loop: the rules undo each other",
  "jme.evaluate.no scope given": "Evaluating an expression needs a scope",
  "jme.func.except.continuous range": "Can't use `except` on a continuous range (step 0)",
  "jme.func.listval.invalid index": "Index {index} is outside the list, which has {size} elements",
  "jme.func.listval.key not in dict": "Key {key} is not in the dictionary",
  "jme.func.listval.not a list": "Only a list can be indexed",
  "jme.func.parse.no notation": "There is no notation called {notation_name}",
  "jme.func.satisfy.condition not a boolean": "The conditions of `satisfy` must evaluate to true or false",
  "jme.func.satisfy.took too many runs": "`satisfy` could not find values satisfying the conditions",
  "jme.func.satisfy.wrong number of definitions": "`satisfy` needs one definition for each name",
  "jme.func.switch.no default case": "No case of `switch` is true and there is no default case",
  "jme.iterate_until.condition produced non-boolean": "The condition of `iterate_until` produced {type} instead of a boolean",
  "jme.makeFast.no fast definition of function": "The function {name} has no definition that can be made fast",
  "jme.map.matrix map returned non number": "Mapping over a matrix must produce numbers",
  "jme.map.vector map returned non number": "Mapping over a vector must produce numbers",
  "jme.matchTree.group name not a name": "The name of a captured group must be a name or a key-value pair",
  "jme.matchTree.match macro first argument not a dictionary":
    "The first argument of `@ must be a dictionary of sub-patterns",
  "jme.matrix.reports bad size": "The matrix reports a size which does not match its contents",
  "jme.matrix.value not the right type": "Value of the wrong type used to build a matrix",
  "jme.parse signature.invalid signature string": "Invalid function signature: {str}",
  "jme.script.error parsing notes": "Error parsing the notes: {message}",
  "jme.script.note.compilation error": "Compilation error in note {name}: {message}",
  "jme.script.note.empty expression": "Note {name} has no expression",
  "jme.script.note.invalid definition": 'Invalid note definition: "{source}".{hint}',
  "jme.script.note.invalid definition.description missing closing bracket":
    " The description is missing its closing bracket.",
  "jme.script.note.invalid definition.missing colon":
    " The colon separating the name from the expression is missing.",
  "jme.shunt.expected argument before comma": "An argument is missing before the comma",
  "jme.shunt.keypair in wrong place": "Key-value pair out of place: a dictionary or a pattern is needed",
  "jme.shunt.list mixed argument types": "List elements ({mode}) and dictionary elements ({argmode}) can't be mixed",
  "jme.shunt.missing operator": "An operator is missing: the expression can't be evaluated",
  "jme.shunt.no left bracket": "There is no matching opening bracket",
  "jme.shunt.no left bracket in function": "There is no matching opening bracket in the function application",
  "jme.shunt.no right bracket": "There is no matching closing bracket",
  "jme.shunt.no right square bracket": "There is no matching closing square bracket to end the list",
  "jme.shunt.not enough arguments": "Not enough arguments for the operation {op}",
  "jme.shunt.pipe right hand takes no arguments":
    "The right-hand side of the pipe operator must be a function application",
  "jme.substituteTree.undefined variable": "Undefined variable: {name}",
  "jme.subvars.error compiling": "{message} in the expression {expression}",
  "jme.subvars.null substitution": "Empty substitution in {str}",
  "jme.subvars.display not available": "Substituting into {op} needs the display module, which is not loaded yet",
  "jme.texsubvars.missing parameter": "Missing parameter in {op}: {parameter}",
  "jme.texsubvars.no right brace": "No matching closing brace in {op}",
  "jme.texsubvars.no right bracket": "No matching closing square bracket in the arguments of {op}",
  "jme.thtml.not html": "A non-HTML value was passed to the html type constructor",
  "jme.tokenise.invalid near": "Invalid expression: {expression}, at position {position} near {nearby}",
  "jme.tokenise.keypair key not a string": "A dictionary key must be a string, not {type}",
  "jme.tokenise.number.object not complex": "A non-complex object was passed to a number constructor",
  "jme.type.no cast method": "There is no automatic conversion from {from} to {to}",
  "jme.type.type already registered": "The data type {type} is already registered",
  "jme.typecheck.for in name wrong type": "The name bound by `of:` must be a name or a list of names, not {type}",
  "jme.typecheck.function maybe implicit multiplication":
    "The function {name} is not defined: did you mean {first}*{possibleOp}(...)?",
  "jme.typecheck.function not defined":
    "The function {op} is not defined: is {op} a variable, and did you mean {suggestion}*(...)?",
  "jme.typecheck.map not on enumerable": "Cannot map over a value of type {type}",
  "jme.typecheck.no right type definition": "No definition of {op} matches these argument types",
  "jme.typecheck.no right type unbound name": "The variable {name} is not defined",
  "jme.typecheck.op not defined": "The operation {op} is not defined",
  "jme.typecheck.wrong arguments for anonymous function": "Wrong number of arguments for this anonymous function",
  "jme.typecheck.wrong names for anonymous function":
    "Invalid argument names for an anonymous function: {names_type}",
  "jme.user javascript.error": "Error in the JavaScript function {name}: {message}",
  "jme.user javascript.returned undefined": "The JavaScript function {name} did not return a value",
  "jme.variables.async function not supported": "The function {name} is asynchronous, which is not supported",
  "jme.variables.circular reference": "Circular reference while computing {name}",
  "jme.variables.empty definition": "Variable {name} has no definition",
  "jme.variables.empty name": "A variable's name cannot be empty",
  "jme.variables.error computing dependency": "Error computing the dependency {name}: {message}",
  "jme.variables.error evaluating variable": "Error evaluating the variable {name}: {message}",
  "jme.variables.error making function": "Error creating the function {name}: {message}",
  "jme.variables.invalid function language": "Invalid function language: {language}",
  "jme.variables.javascript function not allowed": "JavaScript functions are not allowed here ({name})",
  "jme.variables.syntax error in function definition": "Syntax error in the function definition",
  "jme.variables.variable not defined": "Variable {name} is not defined",
  "jme.vector.value not an array of numbers": "A vector must be built from an array of numbers",
  // marking.js — the marking engine's error keys. The two marked "ours"
  // replace an upstream `TypeError`.
  "marking.apply.not a list": "The first argument to `apply` must be a list",
  "marking.no question in scope": "There is no question in which to look for the part {path}", // ours
  "marking.note.error evaluating note": "Error evaluating the note {name}: {message}",
  "marking.state function outside marking script":
    "The function {name} can only be used inside a marking script", // ours
  // Messages shown to the student: those called with `R()` from marking.js and
  // those called with `translate(...)` by the 5 in-scope `.jme` scripts
  // (inventory 05 §6.4 and §6.5).
  "part.gapfill.error marking gap": "Error marking {name}: {message}",
  "part.gapfill.feedback header": "<strong>{name}</strong>",
  "part.jme.answer invalid": "Your answer is not a valid mathematical expression.<br/>{message}.",
  "part.jme.error checking numerically": "There was an error numerically checking your answer: {message}",
  "part.jme.marking.correct": "Your answer is numerically correct.",
  "part.jme.must-have bits": '<span class="monospace">{string}</span>',
  "part.jme.must-have one": "Your answer must contain: {strings}",
  "part.jme.must-have several": "Your answer must contain all of: {strings}",
  "part.jme.must-match.failed": "Your answer is not in the expected form.",
  "part.jme.must-match.warning": "Your answer is not in the expected form: {message}",
  "part.jme.not-allowed bits": '<span class="monospace">{string}</span>',
  "part.jme.not-allowed one": "Your answer must not contain: {strings}",
  "part.jme.not-allowed several": "Your answer must not contain any of: {strings}",
  "part.jme.unexpected variable name":
    "Your answer was interpreted to use the unexpected variable name <code>{name}</code>.",
  "part.marking.correct": "Your answer is correct.",
  "part.marking.incorrect": "Your answer is incorrect.",
  "part.marking.nothing entered": "You did not enter an answer.",
  "part.marking.partially correct": "Your answer is partially correct.",
  "part.mcq.correct choice": "You chose a correct answer.",
  "part.mcq.incorrect choice": "You chose an incorrect answer.",
  "part.mcq.wrong number of choices": "You selected the wrong number of choices.",
  "part.numberentry.answer invalid": "You did not enter a valid number.",
  "part.numberentry.answer not reduced": "Your answer is not reduced to lowest terms.",
  "part.patternmatch.correct except case": "Your answer is correct, except for the case.",
  "question.can not submit": "Can not submit answer - check for errors.",
  "ruleset.circular reference": "Circular reference in the ruleset {name}",
  "ruleset.set not defined": "The ruleset {name} is not defined",
  "util.equality not defined for type": "Equality is not defined for the type {type}",
  // part.js and parts/*.js — see the Italian file for the note on the
  // "literal" keys.
  "alternative": "alternative",
  "gap": "gap",
  "part": "part",
  "step": "step",
  "minimum value": "minimum value",
  "maximum value": "maximum value",
  "You have not given your answer to the correct precision.":
    "You have not given your answer to the correct precision.",
  "feedback.you were awarded": "You were awarded <strong>{count}</strong> mark.",
  "feedback.you were awarded_plural": "You were awarded <strong>{count}</strong> marks.",
  "feedback.taken away": "<strong>{count}</strong> mark was taken away.",
  "feedback.taken away_plural": "<strong>{count}</strong> marks were taken away.",
  "part.error": "{path}: {message}",
  "part.missing type attribute": "{part}: Missing part type attribute",
  "part.unknown type": "{part}: Unrecognised part type {type}",
  "part.setting not present": "Property '{property}' not set",
  "part.marking.did not answer": "You did not answer this question.",
  "part.marking.error in adaptive marking":
    "There was an error in the adaptive marking for this part. Please report this. {message}",
  "part.marking.error in marking script":
    "There was an error in this part's marking algorithm. Please report this. {message}",
  "part.marking.maximum scaled down":
    "The maximum you can score for this part is <strong>{count}</strong> mark. Your scores will be scaled down accordingly.",
  "part.marking.maximum scaled down_plural":
    "The maximum you can score for this part is <strong>{count}</strong> marks. Your scores will be scaled down accordingly.",
  "part.marking.maximum score applied": "The maximum score for this part is <strong>{score}</strong>.",
  "part.marking.minimum score applied": "The minimum score for this part is <strong>{score}</strong>.",
  "part.marking.missing required note": "The marking algorithm does not define the note <code>{note}</code>",
  "part.marking.no result after replacement":
    "This part could not be marked using your answers to previous parts.",
  "part.marking.not submitted": "No answer submitted.",
  "part.marking.parameter already in scope":
    "There is a variable named <code>{name}</code>, which is also the name of a marking parameter. Please rename the variable.",
  "part.marking.resubmit because of variable replacement":
    "This part's marking depends on your answers to other parts, which you have changed. Save your answer to this part again to update your score.",
  "part.marking.uncaught error": "Error when marking: {message}",
  "part.marking.used variable replacements":
    "This part was marked using your answers to previous parts.",
  "part.marking.variable replacement part not answered": "You must answer {part} first.",
  "part.marking.variable replacement part not found": "Can't find part {part}.",
  "part.marking.adaptive marking use condition not a boolean":
    "The adaptive marking use condition evaluates to {type} instead of a boolean.",
  "part.marking.adaptive variable replacement does not satisfy condition":
    "Your answer to <strong>{name}</strong> was not used because it did not satisfy the condition.",
  "part.marking.adaptive variable replacement does not satisfy condition message":
    "Your answer to <strong>{name}</strong> was not used: {message}",
  "part.marking.adaptive variable replacement refers to self":
    "This part refers to itself in a variable replacement for adaptive marking.",
  "part.marking.adaptive variable replacement refers to nothing":
    "This part contains an invalid variable replacement for adaptive marking.",
  "part.gapfill.cyclic adaptive marking":
    "There is a cycle in the adaptive marking for this part: <strong>{name1}</strong> relies on <strong>{name2}</strong>, which eventually relies on <strong>{name1}</strong>.",
  "part.jme.answer missing": "Correct answer is missing",
  "part.jme.invalid value generator expression":
    "Invalid value generator expression for variable <code>{name}</code>: {message}",
  "part.mcq.invalid layout": "The layout for this part is not valid (type: {layoutType}).",
  "part.mcq.matrix cell empty": "Part {part} marking matrix cell ({row},{column}) is empty",
  "part.mcq.matrix jme error": "Part {part} marking matrix cell ({row},{column}) gives a JME error: {error}",
  "part.mcq.matrix not a list": "Marking matrix, defined by JME expression, is not a list but it should be.",
  "part.mcq.matrix not a number": "Part {part} marking matrix cell ({row},{column}) does not evaluate to a number",
  "part.mcq.matrix wrong size": "Marking matrix is the wrong size.",
  "part.mcq.options def not a list": "The expression defining the {properties} is not a list.",
  "part.numberentry.display answer wrong type":
    "The display answer for this part is a value of type <code>{got_type}</code>, but should be a <code>{want_type}</code>.",
  "part.numberentry.negative decimal places":
    "This part is set up to round the student's answer to a negative number of decimal places, which has no meaning.",
  "part.numberentry.zero sig fig":
    "This part is set up to round the student's answer to zero significant figures, which has no meaning.",
  // question.js — the keys used while loading a question and running its life
  // cycle (inventory 06 §5). The four marked "ours" have no upstream
  // equivalent: they reject out-of-scope features (decisions 1-4 of the Task 9
  // brief).
  "question.error": "Question {number}: {message}",
  "question.error in advice": "Error in the hint", // ours, fix round 1
  "question.error in part prompt": "Error in the prompt of part {path}", // ours, fix round 1
  "question.error in statement": "Error in the exercise's statement", // ours, fix round 1
  "question.function.async not supported":
    "The function {name} is asynchronous (type: \"promise\"): this engine is synchronous and does not support it", // ours
  "question.no such part": "Can't find the part {path}",
  "question.parts mode not supported": "The parts mode \"{mode}\" is not supported", // ours
  "question.preamble not supported":
    "This question has a JavaScript preamble: the engine does not run arbitrary code", // ours
  "question.required extension not available":
    "This question requires the extension <code>{extension}</code> but it is not available",
  "jme.variables.duplicate definition": "There is more than one definition of the variable {name}",
  "jme.variables.question took too many runs to generate variables":
    "A valid set of question variables was not generated in time",
  "variable.error in variable definition": "Error in the definition of the variable {name}",
};
