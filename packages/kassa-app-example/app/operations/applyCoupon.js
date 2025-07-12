// app/operations/applyCoupon.js
// Кастомная операция для применения купона.
// context - полный контекст данных
// args - разрешенные аргументы из manifest.js

module.exports = (context, args) => {
    const { couponCode } = args;
    const { receipt } = context;

    // Простая бизнес-логика: разные купоны дают разную скидку
    if (couponCode === 'SALE15') {
        receipt.discountPercent = 15;
        console.log(`[Operation:applyCoupon] Applied 15% discount.`);
    } else if (couponCode === 'BIGSALE50') {
        receipt.discountPercent = 50;
        console.log(`[Operation:applyCoupon] Applied 50% discount.`);
    } else {
        // Можно добавить логику для неверного купона, но пока просто сбрасываем
        receipt.discountPercent = 0;
        console.log(`[Operation:applyCoupon] Invalid coupon code: ${couponCode}. Discount reset to 0%.`);
    }
};