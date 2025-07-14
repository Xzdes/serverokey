// core/migrator.js

class Migrator {
    constructor(migrationsConfig) {
        this.config = migrationsConfig || [];
    }

    /**
     * Проверяет и применяет миграции к набору данных.
     * @param {object} data - Объект данных коннектора (например, { items: [...], total: 0 }).
     * @returns {{data: object, changed: boolean}} - Возвращает обновленные данные и флаг, указывающий, были ли внесены изменения.
     */
    migrate(data) {
        if (this.config.length === 0) {
            return { data, changed: false };
        }

        let changed = false;
        
        // Миграции применяются только к данным, содержащим массив `items`
        if (!Array.isArray(data.items)) {
            return { data, changed: false };
        }

        this.config.forEach(rule => {
            if (rule.if_not_exists && rule.set) {
                const fieldToCheck = rule.if_not_exists;
                const fieldsToSet = rule.set;

                data.items.forEach(item => {
                    // Проверяем, что поле отсутствует именно у самого объекта, а не в прототипе
                    if (!Object.prototype.hasOwnProperty.call(item, fieldToCheck)) {
                        for (const key in fieldsToSet) {
                            item[key] = fieldsToSet[key];
                        }
                        changed = true;
                    }
                });
            }
        });

        return { data, changed };
    }
}

module.exports = { Migrator };