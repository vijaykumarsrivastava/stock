# Requirements: Stock Tracker

## Introduction

A personal, offline-first app to record stock buy and sell transactions and see current holdings. It is a React + TypeScript + Vite web app, wrapped with Capacitor into an Android APK for persistent native SQLite storage. In the browser it uses IndexedDB. Currency is INR (₹). There are no brokerage or fees.

## Glossary

- **Lot**: one buy transaction. It has a stock, original quantity, buy price, buy date, and remaining quantity.
- **Remaining quantity**: original quantity minus the quantity of that lot already sold.
- **Allocation**: the part of a sell transaction that is matched to one lot (lot, quantity).
- **Holding**: a stock with total remaining quantity greater than zero.

## Requirements

### 1. Record transactions

**User story:** As an investor, I want to record which stock I bought or sold, how many, at what price, and on what date, so that my records are complete.

**Acceptance criteria**
1. The app SHALL provide a form with fields: type (Buy or Sell), stock name, quantity, price per share (₹), and date.
2. WHEN the user enters a stock name, THE app SHALL suggest names from previously entered stocks and still accept new free-text names.
3. THE app SHALL reject a quantity that is not a positive whole number, a price that is not greater than zero, and a missing date, and SHALL show an error message for each.
4. THE app SHALL treat stock names as the same stock regardless of letter case and surrounding spaces.
5. THE date SHALL default to today and SHALL NOT be allowed in the future.

### 2. Default page: holdings list

**User story:** As an investor, I want to see my current holdings at a glance.

**Acceptance criteria**
1. THE default page SHALL list each holding with stock name, average price, and total remaining quantity.
2. THE average price SHALL be the weighted average of buy price across the stock's lots with remaining quantity, weighted by remaining quantity.
3. THE app SHALL NOT list a stock whose total remaining quantity is zero.
4. WHEN there are no holdings, THE page SHALL show an empty-state message.
5. WHEN the user taps a stock, THE app SHALL open the Buy/Sell page for that stock.
6. Amounts SHALL be shown in ₹ with two decimal places.
7. THE default page SHALL show the overall realized profit or loss across all stocks, and each holding SHALL show that stock's realized profit or loss.
8. THE default page SHALL list fully sold stocks (total remaining quantity zero) in a separate "Fully sold" section with their realized profit or loss, and these SHALL be included in the overall total.
9. Profit SHALL be shown in green and loss in red. Unrealized profit or loss is out of scope because the app has no market prices.

### 3. Buy/Sell page

**User story:** As an investor, I want to see my last buy and sell for a stock and my available lots before I trade.

**Acceptance criteria**
1. THE page SHALL show the last buy (date, quantity, price) and the last sell (date, quantity, price) for the selected stock, or "NA" when none exists.
2. THE page SHALL show a history table of lots with remaining quantity greater than zero. Columns: date, price, original quantity, remaining quantity.
3. THE table SHALL default to sorting by price, descending.
4. WHEN the user taps a column header, THE table SHALL sort by that column, and tapping the same header again SHALL reverse the order.
5. Sorting SHALL be available on every column, including date.
6. WHEN the user changes the stock name, THE last buy, last sell, and history table SHALL update for that stock.

### 4. Selling against specific lots

**User story:** As an investor, I want to choose which lots a sale comes from, so that profit and loss reflect the lots I intend.

**Acceptance criteria**
1. WHEN the transaction type is Sell, THE stock field SHALL be a dropdown of stocks with remaining quantity greater than zero.
2. WHEN a stock is selected for Sell, THE form SHALL list that stock's available lots (date, price, remaining quantity).
3. THE user SHALL be able to select any lot and enter the quantity to take from it. The quantity SHALL default to the smaller of the lot's remaining quantity and the unallocated sell quantity.
4. WHEN the allocated quantity is less than the sell quantity, THE user SHALL be able to select further lots until the total equals the sell quantity.
5. THE form SHALL show the allocated total, the sell quantity, and the quantity still to allocate.
6. THE app SHALL NOT allow saving a sell until the allocated total equals the sell quantity.
7. THE app SHALL NOT allow an allocation quantity above the lot's remaining quantity, and SHALL NOT allow total sell quantity above the stock's total remaining quantity.
8. WHEN a sell is saved, THE app SHALL reduce each selected lot's remaining quantity by its allocated quantity.
9. THE sell SHALL record its realized profit or loss as the sum over allocations of (sell price − lot buy price) × allocated quantity, and SHALL display it after saving and in the transaction list.
10. WHILE the user fills in a sell, THE form SHALL show the estimated profit or loss for each selected lot (in the lot table) and the total for all selected lots, updating as the quantities or sell price change. A lot's estimate SHALL be hidden while its quantity or the sell price is invalid.

### 5. Edit and delete transactions

**User story:** As an investor, I want to fix mistakes.

**Acceptance criteria**
1. THE app SHALL list all transactions and allow editing or deleting each one.
2. WHEN a transaction is edited or deleted, THE app SHALL recalculate affected lots' remaining quantities from the stored allocations.
3. THE app SHALL block an edit or delete that would make any lot's remaining quantity negative or leave a sell without valid allocations, and SHALL explain why.
4. WHEN a buy lot that has sales against it is deleted, THE app SHALL block the delete and tell the user which sells depend on it.
5. WHEN a sell is edited, THE user SHALL be able to change its lot allocations by the same rules as requirement 4.
6. THE app SHALL ask for confirmation before deleting.
7. THE transaction list SHALL show, for every sell, each linked buy lot (quantity, buy date, buy price) with the profit or loss on that lot, and the total profit or loss for the sell.
8. WHEN the user taps a linked buy lot on a sell, THE app SHALL scroll to that buy in the transaction list and briefly highlight it.

### 6. Storage and persistence

**User story:** As an investor, I want my data to stay on my device and work offline.

**Acceptance criteria**
1. THE app SHALL work fully offline with no network calls.
2. IN the Android APK, THE app SHALL store data in native SQLite in the app's private storage.
3. IN the browser, THE app SHALL store data in IndexedDB and SHALL request persistent storage through `navigator.storage.persist()`.
4. BOTH storage backends SHALL implement one shared interface, so the UI and business logic do not depend on the backend.
5. THE app SHALL write each transaction and its lot changes atomically, so a failure leaves no partial data.
6. THE app SHALL handle at least 50 MB of data without noticeable slowdown on the main pages.

### 7. Backup: JSON export and import

**User story:** As an investor, I want to back up and restore my data.

**Acceptance criteria**
1. THE app SHALL export all transactions and allocations to a JSON file the user can save.
2. THE app SHALL import a JSON file exported by the app and offer to replace existing data.
3. BEFORE replacing data, THE app SHALL validate the file's structure and lot consistency, and SHALL leave existing data unchanged if validation fails.
4. THE app SHALL ask for confirmation before replacing data.

### 8. Platform and build

**Acceptance criteria**
1. THE UI SHALL be mobile-first and usable on a phone-sized screen.
2. THE project SHALL support development and testing in a desktop browser.
3. THE repository SHALL include a GitHub Actions workflow that builds a debug Android APK and publishes it as a downloadable artifact.

### 9. Users

**User story:** As an investor, I want separate users, so that each person's stocks and profit and loss stay apart.

**Acceptance criteria**
1. THE first page on every launch SHALL ask the user to select a user from a dropdown or add a new one.
2. A new user SHALL need only one field: the user name, 1 to 50 characters after trimming.
3. THE app SHALL reject a name that matches an existing user, ignoring letter case and extra spaces, and SHALL show a message.
4. WHEN a user is added, THE app SHALL save it and open the app as that user.
5. EVERY transaction SHALL belong to one user, and all pages (holdings, trade, history, profit and loss, autocomplete) SHALL show only the selected user's data.
6. A sell SHALL only use buy lots of the same user.
7. THE app SHALL show the selected user's name and a "Switch user" button that returns to the first page.
8. WHEN existing data from before users existed is found, THE app SHALL assign it to a user named "Default".
9. Backup export and import SHALL cover all users. Importing a version 1 backup (no users) SHALL assign its transactions to a "Default" user.

## Assumptions and out of scope

- Single user, single device, one currency (₹). No login.
- No brokerage, taxes, or fees. No live market prices or unrealized profit or loss.
- No cloud or Google Sheets sync.
- Quantities are whole shares.
- Short selling is not supported.
- Uninstalling the APK or clearing its data deletes the data. Use export to back up.
