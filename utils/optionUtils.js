class OptionUtils {
  static findATMStrike(spotPrice) {
    // Round to nearest 100 for BANKNIFTY
    return Math.round(spotPrice / 100) * 100;
  }

  static calculateStopLoss(price, type, percentage) {
    return type === 'CALL' 
      ? price * (1 + percentage)
      : price * (1 - percentage);
  }
}

module.exports = OptionUtils; 