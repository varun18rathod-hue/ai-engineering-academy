"""Small AST interpreter: never exec/eval learner code or allow OS access."""
import ast
import operator

def check_activity(lesson, code, output, starter):
    lines = [line for line in output.splitlines() if line.strip()]
    if output.startswith('(No printed output') or not lines:
        return False, 'The code ran. Add a print instruction that shows the result requested in the activity.'
    if lesson in ('day-3', 'day-4') and code.strip() == starter.strip():
        return False, 'The demonstration runs. Now change it as the activity asks and run your own version.'
    if lesson in ('day-4', 'day-7') and len(lines) < 2:
        return False, 'The activity needs two printed lines. Add the second line and run it again.'
    return True, 'Your code ran and met the activity’s basic checks. Ask the tutor to review your explanation too.'

class PracticeError(ValueError):
    pass

def run_practice(code):
    if not isinstance(code, str) or not code.strip():
        raise PracticeError('Write one instruction first. Try the example from the lesson.')
    if len(code) > 4000:
        raise PracticeError('Keep this first program under 4,000 characters.')
    try:
        tree = ast.parse(code)
    except SyntaxError as error:
        raise PracticeError(f'Line {error.lineno}: {error.msg}. Check your quotes and parentheses.') from None
    if len(list(ast.walk(tree))) > 200:
        raise PracticeError('Try a smaller program in this beginner pad.')
    variables, lines = {}, []
    operators = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul,
                 ast.Div: operator.truediv, ast.FloorDiv: operator.floordiv, ast.Mod: operator.mod}

    def bounded(value):
        if type(value) not in (str, int, float, bool) and value is not None:
            raise PracticeError('This pad supports text, numbers, and simple math.')
        if isinstance(value, str) and len(value) > 4000:
            raise PracticeError('That result is too long for this pad.')
        if type(value) in (int, float) and (not -1e12 <= value <= 1e12):
            raise PracticeError('Use smaller numbers for this exercise.')
        return value

    def value(node):
        if isinstance(node, ast.Constant):
            return bounded(node.value)
        if isinstance(node, ast.Name):
            if node.id not in variables:
                raise PracticeError(f'We do not have a value for {node.id!r}. Check the name or add quotes for text.')
            return variables[node.id]
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub)):
            item = value(node.operand)
            return bounded(+item if isinstance(node.op, ast.UAdd) else -item)
        if isinstance(node, ast.BinOp) and type(node.op) in operators:
            left, right = value(node.left), value(node.right)
            if isinstance(node.op, ast.Mult) and (isinstance(left, str) or isinstance(right, str)):
                raise PracticeError('Use numbers for multiplication in this pad.')
            if isinstance(node.op, ast.Mod) and isinstance(left, str):
                raise PracticeError('Use numbers for the remainder operation in this pad.')
            return bounded(operators[type(node.op)](left, right))
        raise PracticeError('This beginner pad supports print, variables, and simple math. Imports, loops, and other features come later.')

    try:
        for statement in tree.body:
            if isinstance(statement, ast.Expr) and isinstance(statement.value, ast.Constant) and isinstance(statement.value.value, str):
                continue
            if isinstance(statement, ast.Assign) and len(statement.targets) == 1 and isinstance(statement.targets[0], ast.Name):
                name = statement.targets[0].id
                if name.startswith('_') or name == 'print':
                    raise PracticeError('Choose a simple variable name that does not start with _ or replace print.')
                variables[name] = value(statement.value)
            elif isinstance(statement, ast.Expr) and isinstance(statement.value, ast.Call):
                call = statement.value
                if not isinstance(call.func, ast.Name) or call.func.id != 'print' or call.keywords:
                    raise PracticeError('Only print(...) calls are available in this pad.')
                lines.append(' '.join(str(value(argument)) for argument in call.args))
            else:
                raise PracticeError('Try print, a variable assignment, or simple arithmetic. More Python features come later.')
    except (TypeError, ZeroDivisionError, OverflowError) as error:
        raise PracticeError(f'{type(error).__name__}: {error}. Check the values in your calculation.') from None
    output = '\n'.join(lines)
    if len(output) > 12000:
        raise PracticeError('That produces too much output. Try fewer print instructions.')
    return output or '(No printed output. Use print(...) to show a value.)'
