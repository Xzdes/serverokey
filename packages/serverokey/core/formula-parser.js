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
        const funcMatch = formula.match(/^(\w+)\((.*)\)$/);
        if (funcMatch) {
            const funcName = funcMatch[1];
            const args = (funcMatch[2] || '').split(',').map(arg => arg.trim().replace(/['"]/g, '')).filter(Boolean);
            if (this.functions[funcName]) {
                return this.functions[funcName](...args);
            }
        }
        // НЕ ПЫТАЕМСЯ ВЫПОЛНИТЬ JS
        return NaN;
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