// core/data-manipulator.js

// Вспомогательная функция для безопасного получения вложенных значений
function getValue(obj, path) {
    return path.split('.').reduce((o, i) => (o ? o[i] : undefined), obj);
}

class DataManipulator {
    constructor(context) {
        this.context = context; // Контекст данных (например, { receipt: ..., positions: ... })
    }

    execute(config) {
        const { operation, target, source, findBy, match } = config;

        // Получаем ссылку на массив, который будем менять
        const targetArray = getValue(this.context, target);
        if (!Array.isArray(targetArray)) {
            throw new Error(`DataManipulator Error: Target "${target}" is not an array.`);
        }

        switch (operation) {
            case 'push':
                this._handlePush(targetArray, source, findBy);
                break;
            case 'removeFirstWhere':
                this._handleRemove(targetArray, match);
                break;
            // Здесь можно будет добавлять новые операции: 'updateWhere', 'clear', etc.
            default:
                throw new Error(`DataManipulator Error: Unknown operation "${operation}".`);
        }
    }

    _handlePush(targetArray, source, findBy) {
        if (!source || !findBy) {
            throw new Error('DataManipulator Error: "push" operation requires "source" and "findBy".');
        }

        const sourceArray = getValue(this.context, source);
        if (!Array.isArray(sourceArray)) {
            throw new Error(`DataManipulator Error: Source "${source}" is not an array.`);
        }

        // Находим ключ и значение для поиска
        const findByKey = Object.keys(findBy)[0];
        const findByValuePath = findBy[findByKey];
        
        // Получаем значение из body запроса
        const valueToFind = getValue(this.context, findByValuePath);

        // Ищем элемент в исходном массиве
        const itemToAdd = sourceArray.find(item => String(item[findByKey]) === String(valueToFind));
        
        if (itemToAdd) {
            // Создаем копию, чтобы не было ссылочных проблем
            targetArray.push(JSON.parse(JSON.stringify(itemToAdd)));
        }
    }

    _handleRemove(targetArray, match) {
        if (!match) {
            throw new Error('DataManipulator Error: "removeFirstWhere" operation requires "match".');
        }

        const matchKey = Object.keys(match)[0];
        const matchValuePath = match[matchKey];
        const valueToMatch = getValue(this.context, matchValuePath);
        
        const indexToRemove = targetArray.findIndex(item => String(item[matchKey]) === String(valueToMatch));

        if (indexToRemove > -1) {
            targetArray.splice(indexToRemove, 1);
        }
    }
}

module.exports = { DataManipulator };