// core/formula-parser.js

class FormulaParser {
    constructor(dataContext) {
        // dataContext - это сам объект данных, например, `receipt`
        this.context = dataContext;
        this.functions = {
            'sum': this._sum,
            'count': this._count,
        };
    }

    // Основной метод для вычисления формулы
    evaluate(formula) {
        // Проверяем, является ли формула вызовом нашей функции
        const funcMatch = formula.match(/^(\w+)\((.*)\)$/);
        if (funcMatch) {
            const funcName = funcMatch[1];
            const args = funcMatch[2].split(',').map(arg => arg.trim().replace(/['"]/g, ''));
            
            if (this.functions[funcName]) {
                // Вызываем нашу безопасную функцию
                return this.functions[funcName].call(this, ...args);
            }
        }

        // Если это не функция, пробуем как простое математическое выражение
        // Это более сложная часть, для безопасности мы будем использовать очень строгий подход.
        // Мы заменяем имена переменных их значениями из контекста.
        const expression = formula.replace(/[a-zA-Z_][a-zA-Z0-9_]*/g, (match) => {
            // Если переменная есть в контексте, подставляем ее значение
            if (this.context.hasOwnProperty(match)) {
                return this.context[match];
            }
            // Если нет, это может быть число или ошибка. Оставляем как есть,
            // new Function() разберется.
            return match;
        });

        try {
            // Используем 'new Function()' - это безопаснее, чем eval(),
            // т.к. не имеет доступа к локальной области видимости.
            // Мы создаем функцию, которая только возвращает результат нашего выражения.
            return new Function(`return ${expression}`)();
        } catch (e) {
            console.error(`[FormulaParser] Error evaluating expression: "${formula}" -> "${expression}"`, e);
            return NaN;
        }
    }

    // --- Встроенные, безопасные функции ---

    _sum(arrayName, fieldName) {
        const arr = this.context[arrayName];
        if (!Array.isArray(arr)) return 0;
        return arr.reduce((acc, item) => acc + parseFloat(item[fieldName] || 0), 0);
    }

    _count(arrayName) {
        const arr = this.context[arrayName];
        if (!Array.isArray(arr)) return 0;
        return arr.length;
    }
}

module.exports = { FormulaParser };