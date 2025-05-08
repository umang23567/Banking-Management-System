import express from "express";
import mysql from "mysql2";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());



// Database connection
const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "Priyanshu@phc",
  database: "bank",
});

db.connect((err) => {
  if (err) throw err;
  console.log("MySQL Connected...");
});

app.get("/customers", (req, res) => {
  db.query("SELECT * FROM customer", (err, results) => {
    if (err) throw err;
    res.json(results);
  });
});

app.get("/branches", (req, res) => {
  db.query("SELECT * FROM Branch", (err, results) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ error: "Failed to fetch branches" });
    }
    res.json(results);
  });
});

// Get all accounts with optional filtering
app.get("/accounts", (req, res) => {
  const { type, search, sort } = req.query;
  let query = `
    SELECT 
      a.Account_ID, 
      a.Balance, 
      a.Type,
      s.Daily_Withdrawal_Limit,
      s.Rate_of_Interest,
      c.Transaction_Charges
    FROM Account a
    LEFT JOIN Savings_Acc s ON a.Account_ID = s.Account_ID
    LEFT JOIN Current_Acc c ON a.Account_ID = c.Account_ID
  `;

  const whereClauses = [];
  if (type && ["savings", "current"].includes(type)) {
    whereClauses.push(
      `a.Type = '${type === "savings" ? "Savings" : "Current"}'`
    );
  }
  if (search) {
    whereClauses.push(
      `a.Account_ID LIKE '%${mysql.escape(search).replace(/'/g, "")}%'`
    );
  }

  if (whereClauses.length > 0) {
    query += ` WHERE ${whereClauses.join(" AND ")}`;
  }

  if (sort && ["asc", "desc"].includes(sort)) {
    query += ` ORDER BY a.Balance ${sort.toUpperCase()}`;
  }

  db.query(query, (err, results) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ error: "Failed to fetch accounts" });
    }
    res.json(results);
  });
});

// Get single account details
app.get("/accounts/:id", (req, res) => {
  const accountId = req.params.id;
  const query = `
    SELECT 
      a.*,
      s.Daily_Withdrawal_Limit,
      s.Rate_of_Interest,
      c.Transaction_Charges
    FROM Account a
    LEFT JOIN Savings_Acc s ON a.Account_ID = s.Account_ID
    LEFT JOIN Current_Acc c ON a.Account_ID = c.Account_ID
    WHERE a.Account_ID = ?
  `;

  db.query(query, [accountId], (err, results) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ error: "Failed to fetch account details" });
    }
    if (results.length === 0) {
      return res.status(404).json({ error: "Account not found" });
    }
    res.json(results[0]);
  });
});

app.get("/employees", (req, res) => {
  db.query("SELECT * FROM Employee", (err, results) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ error: "Failed to fetch employees" });
    }
    res.json(results);
  });
});

// Get employee by ID
app.get("/employees/:id", (req, res) => {
  const employeeId = req.params.id;
  db.query(
    "SELECT * FROM Employee WHERE Employee_ID = ?",
    [employeeId],
    (err, results) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ error: "Failed to fetch employee" });
      }
      if (results.length === 0) {
        return res.status(404).json({ error: "Employee not found" });
      }
      res.json(results[0]);
    }
  );
});

app.post("/login", (req, res) => {
  const { id, password, userType } = req.body;

  if (userType === "customer") {
    const query = `
          SELECT c.Customer_ID, c.Name, a.Password 
          FROM Customer c
          JOIN Auth_Customer a ON c.Customer_ID = a.Customer_ID
          WHERE c.Customer_ID = ?
      `;

    db.query(query, [id], (err, results) => {
      if (err || results.length === 0) {
        return res.status(401).json({ error: "Invalid Customer ID" });
      }

      const user = results[0];
      if (user.Password !== password) {
        return res.status(401).json({ error: "Invalid Password" });
      }

      res.json({
        success: true,
        userType: "customer",
        userData: {
          id: user.Customer_ID,
          name: user.Name,
        },
      });
    });
  } else if (userType === "employee") {
    const query = `
          SELECT e.Employee_ID, e.Name, a.Password 
          FROM Employee e
          JOIN Auth_Employee a ON e.Employee_ID = a.Employee_ID
          WHERE e.Employee_ID = ?
      `;

    db.query(query, [id], (err, results) => {
      if (err || results.length === 0) {
        return res.status(401).json({ error: "Invalid Employee ID" });
      }

      const user = results[0];
      if (user.Password !== password) {
        return res.status(401).json({ error: "Invalid Password" });
      }

      res.json({
        success: true,
        userType: "employee",
        userData: {
          id: user.Employee_ID,
          name: user.Name,
        },
      });
    });
  } else {
    res.status(400).json({ error: "Invalid user type" });
  }
});

app.post("/register", (req, res) => {
  const { name, dob, phone, street, city, state, pincode, password } = req.body;

  // 1. Create customer
  const customerQuery = `
      INSERT INTO Customer 
      (Name, DOB, Phone_Number, Street, City, State, Pincode)
      VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  db.query(
    customerQuery,
    [name, dob, phone, street, city, state, pincode],
    (err, result) => {
      if (err) return res.status(500).json({ error: "Registration failed" });

      const customerId = result.insertId;

      // 2. Create auth record
      const authQuery = `
              INSERT INTO Auth_Customer (Customer_ID, Password)
              VALUES (?, ?)
          `;

      db.query(authQuery, [customerId, password], (err) => {
        if (err) {
          // Rollback customer creation
          db.query("DELETE FROM Customer WHERE Customer_ID = ?", [customerId]);
          return res.status(500).json({ error: "Registration failed" });
        }

        res.json({
          success: true,
          customerId, // Return the generated Customer_ID
        });
      });
    }
  );
});

// Get customer accounts with details
app.get("/customer/:id/accounts", (req, res) => {
  const query = `
    SELECT a.*, 
           COALESCE(s.Rate_of_Interest, 0) AS Rate_of_Interest,
           COALESCE(s.Daily_Withdrawal_Limit, 0) AS Daily_Withdrawal_Limit,
           COALESCE(c.Transaction_Charges, 0) AS Transaction_Charges
    FROM Deposit d
    JOIN Account a ON d.Account_ID = a.Account_ID
    LEFT JOIN Savings_Acc s ON a.Account_ID = s.Account_ID
    LEFT JOIN Current_Acc c ON a.Account_ID = c.Account_ID
    WHERE d.Customer_ID = ?
  `;
  db.query(query, [req.params.id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// Get customer loans
app.get("/customer/:id/loans", (req, res) => {
  const query = `
    SELECT l.*, b.Branch_Name 
    FROM Borrow br
    JOIN Loan l ON br.Loan_Number = l.Loan_Number
    LEFT JOIN Branch b ON l.Branch_Name = b.Branch_Name
    WHERE br.Customer_ID = ?
  `;
  db.query(query, [req.params.id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// Handle money transfer
app.post("/transfer", (req, res) => {
  const { fromAccount, toAccount, amount } = req.body;

  if (fromAccount === toAccount) {
    return res
      .status(400)
      .json({ error: "Cannot transfer to the same account" });
  }

  // Verify both accounts exist
  db.query(
    "SELECT Balance FROM Account WHERE Account_ID = ?",
    [fromAccount],
    (err, fromAcc) => {
      if (err) {
        console.error("Error checking source account:", err);
        return res.status(500).json({ error: "Database error" });
      }
      if (fromAcc.length === 0)
        return res.status(400).json({ error: "Invalid source account" });

      db.query(
        "SELECT 1 FROM Account WHERE Account_ID = ?",
        [toAccount],
        (err, toAcc) => {
          if (err) {
            console.error("Error checking destination account:", err);
            return res.status(500).json({ error: "Database error" });
          }
          if (toAcc.length === 0)
            return res
              .status(400)
              .json({ error: "Invalid destination account" });

          // Start transaction
          db.beginTransaction((err) => {
            if (err) {
              console.error("Error starting transaction:", err);
              return res
                .status(500)
                .json({ error: "Transaction failed to start" });
            }

            // Get next transaction ID
            db.query(
              "SELECT MAX(Transaction_ID) as maxId FROM Transaction",
              (err, result) => {
                if (err) {
                  db.rollback();
                  console.error("Error getting max transaction ID:", err);
                  return res.status(500).json({ error: "Database error" });
                }

                const nextTransactionId = (result[0].maxId || 5000) + 1;

                // Execute all queries in transaction
                const queries = [
                  // Deduct from sender
                  {
                    sql: "UPDATE Account SET Balance = Balance - ? WHERE Account_ID = ?",
                    values: [amount, fromAccount],
                  },
                  // Add to receiver
                  {
                    sql: "UPDATE Account SET Balance = Balance + ? WHERE Account_ID = ?",
                    values: [amount, toAccount],
                  },
                  // Record transaction for sender
                  {
                    sql: "INSERT INTO Transaction (Transaction_ID, Transaction_Amount, Transaction_Date, Account_ID) VALUES (?, ?, NOW(), ?)",
                    values: [nextTransactionId, amount, fromAccount],
                  },
                  // Record transaction for receiver
                  {
                    sql: "INSERT INTO Transaction (Transaction_ID, Transaction_Amount, Transaction_Date, Account_ID) VALUES (?, ?, NOW(), ?)",
                    values: [nextTransactionId + 1, amount, toAccount],
                  },
                  // Record transfer
                  {
                    sql: "INSERT INTO Transfer_Money (From_Account_ID, To_Account_ID) VALUES (?, ?)",
                    values: [fromAccount, toAccount],
                  },
                ];

                // Execute all queries sequentially
                const executeQueries = (index) => {
                  if (index >= queries.length) {
                    db.commit((err) => {
                      if (err) {
                        db.rollback();
                        console.error("Error committing transaction:", err);
                        return res
                          .status(500)
                          .json({ error: "Transfer failed to commit" });
                      }
                      res.json({
                        success: true,
                        message: "Transfer completed successfully",
                      });
                    });
                    return;
                  }

                  db.query(queries[index].sql, queries[index].values, (err) => {
                    if (err) {
                      db.rollback();
                      console.error(
                        "Error executing query:",
                        queries[index].sql,
                        err
                      );
                      return res
                        .status(500)
                        .json({ error: "Transfer failed during processing" });
                    }
                    executeQueries(index + 1);
                  });
                };

                executeQueries(0);
              }
            );
          });
        }
      );
    }
  );
});

app.get("/customer/:id/transactions", (req, res) => {
  const customerId = req.params.id;
  const query = `
    -- Outgoing transfers (DEBIT)
    SELECT 
      t.Transaction_ID,
      t.Transaction_Amount,
      t.Transaction_Date,
      t.Account_ID,
      'Debit' AS type,
      tm.To_Account_ID AS related_account
    FROM Transaction t
    JOIN Deposit d ON t.Account_ID = d.Account_ID
    JOIN Transfer_Money tm ON t.Account_ID = tm.From_Account_ID
    WHERE d.Customer_ID = ?
    
    UNION ALL
    
    -- Incoming transfers (CREDIT)
    SELECT 
      t.Transaction_ID,
      t.Transaction_Amount,
      t.Transaction_Date,
      t.Account_ID,
      'Credit' AS type,
      tm.From_Account_ID AS related_account
    FROM Transaction t
    JOIN Deposit d ON t.Account_ID = d.Account_ID
    JOIN Transfer_Money tm ON t.Account_ID = tm.To_Account_ID
    WHERE d.Customer_ID = ?
    
    ORDER BY Transaction_Date DESC
    LIMIT 10
  `;

  db.query(query, [customerId, customerId], (err, results) => {
    if (err) {
      console.error("Error fetching transactions:", err);
      return res.status(500).json({ error: "Failed to fetch transactions" });
    }
    res.json(results);
  });
});

// Loan Application Endpoint
// Get all branches (should already exist)
app.get("/branches", (req, res) => {
  db.query("SELECT * FROM Branch", (err, results) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ error: "Failed to fetch branches" });
    }
    res.json(results);
  });
});

// Loan Application Endpoint (updated)
// Loan Application Endpoint (simplified to only add to loan_request table)
app.post("/customer/apply-loan", (req, res) => {
  const { customerId, amount, branchName, purpose } = req.body;

  if (!customerId || !amount || !branchName || !purpose) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  // Verify branch exists
  db.query(
      "SELECT 1 FROM Branch WHERE Branch_Name = ?",
      [branchName],
      (err, results) => {
        if (err) {
          console.error("Error verifying branch:", err);
          return res.status(500).json({ error: "Database error" });
        }

        if (results.length === 0) {
          return res.status(400).json({ error: "Invalid branch selected" });
        }

        // Insert into loan_request table (using auto-increment for request_id)
        const createRequestQuery = `
        INSERT INTO loan_request (
          customer_id,
          requested_amount,
          preferred_branch,
          loan_purpose,
          status,
          request_date
        ) VALUES (?, ?, ?, ?, 'Pending', CURRENT_DATE)
      `;

        db.query(
            createRequestQuery,
            [customerId, amount, branchName, purpose],
            (err, result) => {
              if (err) {
                console.error("Error creating loan request:", err);
                return res
                    .status(500)
                    .json({ error: "Failed to submit loan application" });
              }

              res.json({
                success: true,
                message: "Loan application submitted successfully",
                requestId: result.insertId, // Use the auto-generated ID
              });
            }
        );
      }
  );
});

// Loan Status Endpoint
app.get("/customer/loan-status/:customerId", (req, res) => {
  const query = `
    SELECT 
      request_id AS requestId,
      Requested_Amount,
      Preferred_Branch AS branch,
      status,
      request_date AS Request_Date
    FROM loan_request
    WHERE customer_id = ?
    ORDER BY request_date DESC;
  `;

  db.query(query, [req.params.customerId], (err, results) => {
    if (err) {
      console.error("Error fetching loan status:", err);
      return res.status(500).json({ error: "Failed to fetch loan status" });
    }
    res.json(results);
  });
});

app.post("/addcustomer", (req, res) => {
  const { Name, DOB, Phone_Number, Street, City, State, Pincode } = req.body;

  // Step 1: Get the next available Customer_ID
  const getNextIdQuery = `SELECT MAX(Customer_ID) AS maxId FROM Customer`;

  db.query(getNextIdQuery, (err, results) => {
    if (err) {
      console.error("Error getting max Customer_ID:", err);
      return res
          .status(500)
          .json({ error: "Database error while determining next customer ID" });
    }

    const nextId = (results[0].maxId || 0) + 1;

    // Step 2: Insert the new customer
    const insertQuery = `
      INSERT INTO Customer (
        Customer_ID, Name, DOB, Phone_Number, Street, City, State, Pincode
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.query(
        insertQuery,
        [nextId, Name, DOB, Phone_Number, Street, City, State, Pincode],
        (err, result) => {
          if (err) {
            console.error("Error inserting new customer:", err);
            return res.status(500).json({ error: "Failed to add new customer" });
          }

          // Step 3: Add customer to auth table with default password "123"
          const authInsertQuery = `
          INSERT INTO Auth_Customer (
            Customer_ID, Password
          ) VALUES (?, ?)
        `;

          db.query(
              authInsertQuery,
              [nextId, "123"],
              (err, authResult) => {
                if (err) {
                  console.error("Error adding customer to auth table:", err);
                  return res.status(500).json({
                    error: "Customer added but failed to create auth credentials",
                    Customer_ID: nextId
                  });
                }

                res.status(201).json({
                  message: "Customer added successfully with auth credentials",
                  Customer_ID: nextId,
                });
              }
          );
        }
    );
  });
});

app.post("/addaccount", (req, res) => {
  const {
    Customer_ID,
    Balance,
    Type,
    Daily_Withdrawal_Limit,
    Rate_of_Interest,
    Transaction_Charges,
  } = req.body;

  // Step 1: Validate customer exists
  const checkCustomerQuery = `SELECT * FROM Customer WHERE Customer_ID = ?`;
  db.query(checkCustomerQuery, [Customer_ID], (err, customerResults) => {
    if (err)
      return res.status(500).json({ error: "Database error (customer check)" });
    if (customerResults.length === 0) {
      return res.status(400).json({ error: "Customer does not exist" });
    }

    // Step 2: Check if customer already has an account
    const checkExistingAccount = `SELECT * FROM Deposit WHERE Customer_ID = ?`;
    db.query(checkExistingAccount, [Customer_ID], (err, depositResults) => {
      if (err)
        return res
          .status(500)
          .json({ error: "Database error (account check)" });
      if (depositResults.length > 0) {
        return res
          .status(400)
          .json({ error: "Customer already has an account" });
      }

      // Step 3: Get next Account_ID
      const getNextId = `SELECT MAX(Account_ID) AS maxId FROM Account`;
      db.query(getNextId, (err, idResults) => {
        if (err)
          return res.status(500).json({ error: "Database error (ID fetch)" });
        const nextId = (idResults[0].maxId || 1000) + 1;

        // Step 4: Insert into Account
        const insertAccount = `INSERT INTO Account (Account_ID, Balance, Type) VALUES (?, ?, ?)`;
        db.query(insertAccount, [nextId, Balance, Type], (err) => {
          if (err)
            return res.status(500).json({ error: "Failed to insert account" });

          // Step 5: Insert into Savings_Acc or Current_Acc
          let typeInsertQuery, typeParams;

          if (Type === "Savings") {
            typeInsertQuery = `
            INSERT INTO Savings_Acc (Account_ID, Daily_Withdrawal_Limit, Rate_of_Interest)
            VALUES (?, ?, ?)
          `;
            typeParams = [nextId, Daily_Withdrawal_Limit, Rate_of_Interest];
          } else if (Type === "Current") {
            typeInsertQuery = `
            INSERT INTO Current_Acc (Account_ID, Transaction_Charges)
            VALUES (?, ?)
          `;
            typeParams = [nextId, Transaction_Charges];
          } else {
            return res.status(400).json({ error: "Invalid account type" });
          }

          db.query(typeInsertQuery, typeParams, (err) => {
            if (err)
              return res
                .status(500)
                .json({ error: "Failed to insert account type details" });

            // Step 6: Insert into Deposit to link with Customer
            const linkCustomer = `
            INSERT INTO Deposit (Customer_ID, Account_ID)
            VALUES (?, ?)
          `;
            db.query(linkCustomer, [Customer_ID, nextId], (err) => {
              if (err)
                return res
                  .status(500)
                  .json({ error: "Failed to associate customer with account" });

              res
                .status(201)
                .json({
                  message: "Account successfully created",
                  Account_ID: nextId,
                });
            });
          });
        });
      });
    });
  });
});

app.get("/transactions", (req, res) => {
  db.query(
    `
      SELECT
          t.Transaction_ID,
          t.Transaction_Amount,
          t.Transaction_Date,
          t.Account_ID,
          c.Customer_ID,
          c.Name AS Customer_Name
      FROM Transaction t
               JOIN Account a ON t.Account_ID = a.Account_ID
               JOIN Deposit d ON a.Account_ID = d.Account_ID
               JOIN Customer c ON d.Customer_ID = c.Customer_ID
      ORDER BY t.Transaction_Date DESC
  `,
    (err, results) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ error: "Failed to fetch transactions" });
      }
      res.json(results);
    }
  );
});

app.get('/loan-requests', (req, res) => {
  const query = `
    SELECT lr.Request_ID, lr.Customer_ID, c.Name AS Customer_Name,
           lr.Requested_Amount, lr.Request_Date, lr.Loan_Purpose,
           lr.Status, lr.Remarks, lr.Preferred_Branch
    FROM Loan_Request lr
    JOIN Customer c ON lr.Customer_ID = c.Customer_ID
    ORDER BY lr.Request_Date DESC
  `;

  db.query(query, (err, results) => {
    if (err) return res.status(500).json({ error: 'Failed to fetch loan requests' });
    res.json(results);
  });
});

app.patch('/loan-request/:id/status', (req, res) => {
  const { id } = req.params;
  const { status, remarks } = req.body;

  const validStatuses = ['Approved', 'Rejected'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status value' });
  }

  const getRequestQuery = `SELECT * FROM Loan_Request WHERE Request_ID = ?`;
  db.query(getRequestQuery, [id], (err, requestResults) => {
    if (err) return res.status(500).json({ error: 'Database error (fetch request)' });
    if (requestResults.length === 0) return res.status(404).json({ error: 'Loan request not found' });

    const loanRequest = requestResults[0];

    const updateQuery = `
      UPDATE Loan_Request
      SET Status = ?, Remarks = ?
      WHERE Request_ID = ?
    `;

    db.query(updateQuery, [status, remarks || null, id], (err, result) => {
      if (err) return res.status(500).json({ error: 'Failed to update loan request' });

      if (status === 'Rejected') {
        return res.json({ message: `Loan request ${id} marked as Rejected.` });
      }

      const getMaxLoanQuery = `SELECT MAX(Loan_Number) AS maxLoan FROM Loan`;
      db.query(getMaxLoanQuery, (err, maxLoanResult) => {
        if (err) return res.status(500).json({ error: 'Failed to generate new loan number' });

        const nextLoanNumber = (maxLoanResult[0].maxLoan || 100) + 1;

        const insertLoanQuery = `
          INSERT INTO Loan (Loan_Number, Amount, Branch_Name)
          VALUES (?, ?, ?)
        `;

        db.query(
            insertLoanQuery,
            [nextLoanNumber, loanRequest.Requested_Amount, loanRequest.Preferred_Branch],
            (err) => {
              if (err) return res.status(500).json({ error: 'Failed to insert into Loan table' });

              const insertBorrowQuery = `
              INSERT INTO Borrow (Customer_ID, Loan_Number)
              VALUES (?, ?)
            `;

              db.query(
                  insertBorrowQuery,
                  [loanRequest.Customer_ID, nextLoanNumber],
                  (err) => {
                    if (err) return res.status(500).json({ error: 'Failed to insert into Borrow table' });

                    res.json({
                      message: `Loan request ${id} approved. Loan #${nextLoanNumber} created.`,
                      Loan_Number: nextLoanNumber
                    });
                  }
              );
            }
        );
      });
    });
  });
});



app.get('/api/analytics/customers-with-loans', (req, res) => {
  const { city } = req.query;
  
  if (!city) {
    return res.status(400).json({ 
      error: "City parameter is required (e.g., ?city=New%20York)"
    });
  }

  const sql = `
    SELECT c.Customer_ID, c.Name, l.Loan_Number, l.Amount, br.Branch_City
    FROM Customer c
    JOIN Borrow b ON c.Customer_ID = b.Customer_ID
    JOIN Loan l ON b.Loan_Number = l.Loan_Number
    JOIN Branch br ON l.Branch_Name = br.Branch_Name
    WHERE br.Branch_City = ?
  `;

  db.query(sql, [city], (err, results) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ error: "Database query failed" });
    }
    
    // Just return the data without extra wrapper
    res.json(results);
  });
});

app.get('/api/analytics/avg-transaction', (req, res) => {
  const sql = `
    SELECT t.Account_ID, AVG(t.Transaction_Amount) AS avg_transaction, COUNT(*) AS transaction_count
    FROM Transaction t
    GROUP BY t.Account_ID
    HAVING AVG(t.Transaction_Amount) > 100;
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ error: "Database query failed" });
    }
    res.json(results);
  });
});


app.get('/api/analytics/employee-service', (req, res) => {
  const sql = `
    SELECT e.Employee_ID, e.Name, COUNT(b.Customer_ID) AS num_customers
    FROM Employee e
    JOIN Banker b ON e.Employee_ID = b.Employee_ID
    GROUP BY e.Employee_ID, e.Name
    ORDER BY num_customers DESC;
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ error: "Database query failed" });
    }
    res.json(results);
  });
});


app.get('/api/analytics/high-interest-savings', (req, res) => {
  const sql = `
    SELECT sa.Account_ID, sa.Rate_of_Interest
    FROM Savings_Acc sa
    WHERE sa.Rate_of_Interest > (
      SELECT AVG(Rate_of_Interest) FROM Savings_Acc
    );
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ error: "Database query failed" });
    }
    res.json(results);
  });
});


app.get('/api/analytics/branch-summary', (req, res) => {
  const sql = `
    SELECT o.Branch_Name, SUM(l.Amount) AS total_loan, 
           SUM(DISTINCT p.Payment_Amount) AS total_payment,
           (SUM(l.Amount) - SUM(p.Payment_Amount)) AS outstanding_amount
    FROM Originated_By o
    JOIN Loan l ON o.Loan_Number = l.Loan_Number
    JOIN Payment p ON l.Loan_Number = p.Loan_Number
    GROUP BY o.Branch_Name;
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ error: "Database query failed" });
    }
    res.json(results);
  });
});

const PORT = 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));