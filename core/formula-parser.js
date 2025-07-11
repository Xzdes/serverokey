// core/formula-parser.js

class FormulaParser {
    constructor(dataContext) {
        this.context = dataContext;
        this.functions = {
            'sum': this._sum.bind(this),
            'count': this._count.bind(this),
        };
    }

    evaluate(formula) {
        // Проверяем вызов функции
        const funcMatch = formula.match(/^(\w+)\((.*)\)$/);
        if (funcMatch) {
            const funcName = funcMatch[1];
            const args = (funcMatch[2] || '').split(',').map(arg => arg.trim().replace(/['"]/g, '')).filter(Boolean);
            if (this.functions[funcName]) {
                return this.functions[funcName](...args);
            }
        }

        // --- САМОЕ ПРОСТОЕ И НАДЕЖНОЕ РЕШЕНИЕ ---
        // Мы передаем весь контекст данных в безопасную функцию.
        // Это позволяет использовать в формуле любые поля из контекста, включая вложенные.
        try {
            const contextKeys = Object.keys(this.context);
            const contextValues = Object.values(this.context);
            const func = new Function(...contextKeys, `return ${formula};`);
            return func(...contextValues);
        } catch (e) {
            console.error(`[FormulaParser] Error evaluating formula: "${formula}"`, e.message);
            return NaN;
        }
    }

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