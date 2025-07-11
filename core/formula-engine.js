// core/formula-engine.js

class FormulaEngine {
    constructor(context) {
        this.context = context;
    }

    run(steps) {
        if (!Array.isArray(steps)) return;
        steps.forEach(step => this.executeStep(step));
    }

    executeStep(step) {
        if (step.set && step.to !== undefined) {
            const value = this.evaluate(step.to);
            this._setValue(step.set, value);
        } else {
            console.warn('[FormulaEngine] Unknown or incomplete step:', step);
        }
    }

    evaluate(expression) {
        // Проверяем, является ли выражение строкой, иначе это может быть число, массив и т.д.
        if (typeof expression !== 'string') {
            return expression;
        }
        
        try {
            const contextKeys = Object.keys(this.context);
            const contextValues = Object.values(this.context);
            const func = new Function(...contextKeys, `return ${expression};`);
            return func(...contextValues);
        } catch (e) {
            // Если это невалидный JS, возможно, это просто строка. Вернем ее как есть.
            return expression;
        }
    }

    // Устанавливает значение во вложенном объекте
    _setValue(path, value) {
        const keys = path.split('.');
        const lastKey = keys.pop();
        const target = keys.reduce((obj, key) => obj[key] || (obj[key] = {}), this.context);
        target[lastKey] = value;
    }
}

module.exports = { FormulaEngine };