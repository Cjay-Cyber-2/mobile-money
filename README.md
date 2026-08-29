# Mobile Money ↔ Stellar Bridge

[![CI](https://github.com/sublime247/mobile-money/actions/workflows/ci.yml/badge.svg)](https://github.com/sublime247/mobile-money/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/sublime247/mobile-money/branch/main/graph/badge.svg)](https://codecov.io/gh/sublime247/mobile-money)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A backend service that bridges African mobile money providers (MTN MoMo, Airtel Money, Orange Money) with the [Stellar](https://stellar.org) blockchain network — enabling low-cost cross-border payments and remittances across Africa and beyond.

## 🌟 The Problem

Sending money across African borders is expensive and slow. Traditional remittance services charge 7–10% in fees and take hours to days. Meanwhile, **500+ million people** across Africa already use mobile money for everyday transactions — but mobile money stops at the border.

## 💡 The Solution

This platform connects mobile money wallets to the Stellar blockchain, allowing users to:

1. **Deposit** mobile money (XAF) → receive Stellar tokens (XLM, USDC)
2. **Transfer** tokens across Stellar's network in ~5 seconds, for fractions of a cent
3. **Withdraw** Stellar tokens → receive mobile money in the destination country

The sender and recipient interact with their familiar mobile money apps. Stellar handles the cross-border settlement invisibly.

Note: Horizon client connection timeout bounds are configured to 5000ms to prevent request threads from hanging indefinitely.
