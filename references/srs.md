# 📄 SOFTWARE REQUIREMENTS SPECIFICATION (SRS)

## Real-Time Limit Order Book & Matching Engine

## 1. Introduction

**1.1 Purpose**
This Software Requirements Specification (SRS) document defines the functional and non-functional
requirements of a Real-Time Limit Order Book and Matching Engine system. The system simulates a
financial exchange core capable of processing limit orders, executing trades using price-time priority,
and streaming live market data to a frontend interface.
This document is intended for:
Developers
System designers
Academic evaluators
Interview and project reviewers
**1.2 Scope**
The system provides a low-latency, real-time trading engine that:
Accepts buy and sell limit orders
Maintains an in-memory order book
Matches orders deterministically
Executes trades
Persists order and trade data to a database
Streams live order book and trade updates to the frontend using WebSockets
The system does not implement:


FIX or exchange network protocols
High-availability clustering
Regulatory compliance engines
Distributed matching across nodes
**1.3 Definitions, Acronyms, and Abbreviations**
Term Description:
_LOB Limit Order Book
FIFO First In First Out
Bid Buy order
Ask Sell order
Trade Result of matched orders
WebSocket Full-duplex real-time communication protocol_
**1.4 References**
Financial Market Microstructure Theory
Matching Engine Design Principles
WebSocket RFC 6455
PostgreSQL Documentation

## 2. Overall Description

**2.1 Product Perspective**
The system operates as a single-node, in-memory matching engine with asynchronous persistence
and real-time data streaming.
**High-level architecture:**


Client (Frontend)
↕ WebSocket
Matching Engine (In-Memory)
↓ Async Persistence
PostgreSQL Database
The matching engine remains isolated from database latency, ensuring deterministic and fast
execution.
**2.2 Product Functions**
At a high level, the system:
Accepts limit orders
Maintains bid and ask books
Matches orders using price-time priority
Executes partial and full trades
Updates order states
Streams real-time updates to connected clients
Persists historical data asynchronously
**2.3 User Classes and Characteristics**
User Description:
Trader / User Places orders and views live market state
Developer Tests and extends matching logic
Evaluator Reviews correctness and system design


**2.4 Operating Environment**
Backend: Python / Node.js
Database: PostgreSQL
Communication: WebSockets + REST
OS: Linux / Windows / macOS
Frontend: Web browser
**2.5 Design Constraints**
Matching logic must not depend on database queries
Real-time updates must not block execution
System prioritizes correctness over visual complexity
Single-engine architecture
**2.6 Assumptions and Dependencies**
Order input is valid and well-formed
Clock skew is negligible
WebSocket clients handle reconnects gracefully

**3. System Requirements
3.1 Functional Requirements**
FR-1: Order Submission
The system shall accept limit orders containing:
Order ID
Side (BUY / SELL)
Price
Quantity


Timestamp
FR-2: Order Book Maintenance
The system shall maintain:
A bid book sorted in descending price order
An ask book sorted in ascending price order
FR-3: Matching Logic
The system shall match orders based on:

1. Best price priority
2. FIFO priority for orders at the same price level
FR-4: Trade Execution
The system shall execute a trade when:
Best bid price ≥ best ask price
Each trade shall include:
Trade ID
Buy order reference
Sell order reference
Executed price
Quantity
Timestamp
FR-5: Partial Order Fills
The system shall support partial execution of orders and update remaining quantities accordingly.


FR-6: Order Lifecycle Management
The system shall maintain order states:
OPEN
PARTIALLY_FILLED
FILLED
CANCELLED
Orders shall be removed from the active book when fully filled or cancelled.
FR-7: Real-Time Market Data Streaming
The system shall stream live updates using WebSockets, including:
Order book snapshots
Incremental order book changes
Trade executions
WebSocket updates shall be pushed immediately after state changes.
FR-8: Persistence
The system shall persist:
Orders
Trades
Performance metrics
Persistence shall be handled asynchronously to avoid blocking the matching engine.
FR-9: Performance Monitoring
The system shall record performance metrics including:
Orders processed
Trades executed
Execution duration


Throughput
**3.2 Data Requirements**
3.2.1 Order Entity
Field Description
order_id Unique identifier
side BUY / SELL
price Limit price
quantity Original quantity
remaining_quantity Unfilled quantity
status Order state
created_at Timestamp
3.2.2 Trade Entity
Field Description
trade_id Unique identifier
buy_order_id Buy order reference
sell_order_id Sell order reference
price Execution price
quantity Executed quantity
executed_at Timestamp
3.2.3 Order Book (Derived Entity)
Field Description
side BUY / SELL
price Price level
total_quantity Aggregated quantity
orders FIFO queue


**3.3 External Interface Requirements**
3.3.1 REST API
Submit orders
Fetch order history
Fetch trade history
3.3.2 WebSocket Interface
The system shall expose a WebSocket endpoint that:
Pushes live order book updates
Pushes live trade executions
Supports multiple concurrent clients
3.3.3 Database Interface
PostgreSQL used for durable storage
ACID-compliant transactions
Append-only trade records

## 4. Non-Functional Requirements

**4.1 Performance**
Matching must occur in memory
Database latency must not impact execution
Real-time updates must be sub-second
**4.2 Scalability**
Support high order volumes
Modular architecture for future extensions


**4.3 Reliability**
No loss of executed trades
Consistent order state transitions
**4.4 Maintainability**
Modular code structure
Clear separation of concerns
Testable components
**4.5 Security**
Order integrity must be preserved
Trade data must be immutable
Basic input validation enforced

## 5. System Architecture

**5.1 High-Level Components**
Order Ingestion Layer
In-Memory Matching Engine
Order Book Manager
WebSocket Streaming Layer
Persistence Worker
PostgreSQL Database
**5.2 Processing Flow**

1. Order received via API
2. Order inserted into memory
3. Matching logic executed
4. Trades generated


5. WebSocket updates broadcast
6. Persistence handled asynchronously

## 6. Design Decisions

**6.1 WebSockets over Kafka**
WebSockets are used for live data streaming due to:
Low latency
Direct client delivery
Single-node architecture
Kafka was intentionally excluded to avoid unnecessary complexity and latency.

## 7. Future Enhancements

Market orders
Order cancellation/modification APIs
Kafka-based downstream analytics
Multi-engine scalability
Risk management module
Market data replay

## 8. Conclusion

This system provides a correct, real-time, and low-latency limit order book implementation with
modern architectural principles. The design balances academic clarity and industry realism, making it
suitable for learning, evaluation, and future extension.


