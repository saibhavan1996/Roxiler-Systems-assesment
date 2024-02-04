const express = require("express");
const axios = require("axios");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const PORT = process.env.PORT || 3001;
const dbPath = "database.db";

app.get("/initialize-database", async (req, res) => {
  try {
    const response = await axios.get(
      "https://s3.amazonaws.com/roxiler.com/product_transaction.json"
    );
    const data = response.data;

    const db = new sqlite3.Database(dbPath);

    db.serialize(() => {
      db.run(
        `CREATE TABLE transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, dateOfSale TEXT, productTitle TEXT, productDescription TEXT, price REAL, category TEXT)`
      );

      const insertStmt = db.prepare(
        `INSERT INTO transactions (dateOfSale, productTitle, productDescription, price, category) VALUES (?, ?, ?, ?, ?)`
      );
      data.forEach((transaction) => {
        insertStmt.run(
          transaction.dateOfSale,
          transaction.productTitle,
          transaction.productDescription,
          transaction.price,
          transaction.category
        );
      });
      insertStmt.finalize();

      res.json({ message: "Database initialized successfully." });
    });
  } catch (error) {
    console.error("Error fetching data from the API:", error.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.get("/transactions", (req, res) => {
  const { month } = req.query;
  const page = parseInt(req.query.page) || 1;
  const perPage = parseInt(req.query.perPage) || 10;
  const offset = (page - 1) * perPage;

  let query = `SELECT * FROM transactions WHERE strftime('%m', dateOfSale) = ?`;
  const params = [month];

  const { search } = req.query;
  if (search) {
    query += `AND (productTitle LIKE ? OR productDescription LIKE ? OR price LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  query += ` LIMIT ? OFFSET ?`;
  params.push(perPage, offset);

  const db = new sqlite3.Database(dbPath);

  db.all(query, params, (err, rows) => {
    if (err) {
      console.error("Error fetching transactions:", err.message);
      res.status(500).json({ error: "Internal Server Error" });
    } else {
      res.json(rows);
    }
  });
});

app.get("/statistics", (req, res) => {
  const { month } = req.query;

  const db = new sqlite3.Database(dbPath);

  db.get(
    `SELECT SUM(price) AS totalSaleAmount FROM transactions WHERE strftime('%m', dateOfSale) = ?`,
    [month],
    (err, row) => {
      if (err) {
        console.error("Error fetching total sale amount:", err.message);
        res.status(500).json({ error: "Internal Server Error" });
      } else {
        const totalSaleAmount = row.totalSaleAmount || 0;

        db.get(
          `SELECT COUNT(id) AS totalSoldItems FROM transactions WHERE strftime('%m', dateOfSale) = ?`,
          [month],
          (err, row) => {
            if (err) {
              console.error("Error fetching total sold items:", err.message);
              res.status(500).json({ error: "Internal Server Error" });
            } else {
              const totalSoldItems = row.totalSoldItems || 0;

              db.get(
                `SELECT COUNT(id) AS totalNotSoldItems FROM transactions WHERE strftime('%m', dateOfSale) = ? AND price IS NULL`,
                [month],
                (err, row) => {
                  if (err) {
                    console.error(
                      "Error fetching total not sold items:",
                      err.message
                    );
                    res.status(500).json({ error: "Internal Server Error" });
                  } else {
                    const totalNotSoldItems = row.totalNotSoldItems || 0;

                    res.json({
                      totalSaleAmount,
                      totalSoldItems,
                      totalNotSoldItems,
                    });
                  }
                }
              );
            }
          }
        );
      }
    }
  );
});

app.get("/bar-chart", (req, res) => {
  const { month } = req.query;

  const db = new sqlite3.Database(dbPath);

  const priceRanges = [
    { min: 0, max: 100 },
    { min: 101, max: 200 },
    { min: 201, max: 300 },
    { min: 301, max: 400 },
    { min: 401, max: 500 },
    { min: 501, max: 600 },
    { min: 601, max: 700 },
    { min: 701, max: 800 },
    { min: 801, max: 900 },
    { min: 901, max: Number.MAX_SAFE_INTEGER },
  ];

  const result = [];

  priceRanges.forEach((range) => {
    db.get(
      `SELECT COUNT(id) AS count FROM transactions WHERE strftime('%m', dateOfSale) = ? AND price >= ? AND price <= ?`,
      [month, range.min, range.max],
      (err, row) => {
        if (err) {
          console.error(
            `Error fetching items for price range ${range.min} - ${range.max}:`,
            err.message
          );
          res.status(500).json({ error: "Internal Server Error" });
        } else {
          result.push({
            range: `${range.min}-${range.max}`,
            count: row.count || 0,
          });

          if (result.length === priceRanges.length) {
            res.json(result);
          }
        }
      }
    );
  });
});

app.get("/pie-chart", (req, res) => {
  const { month } = req.query;

  const db = new sqlite3.Database(dbPath);

  db.all(
    `SELECT category, COUNT(id) AS count FROM transactions WHERE strftime('%m', dateOfSale) = ? GROUP BY category`,
    [month],
    (err, rows) => {
      if (err) {
        console.error("Error fetching categories:", err.message);
        res.status(500).json({ error: "Internal Server Error" });
      } else {
        const result = rows.map((row) => ({
          category: row.category,
          count: row.count,
        }));

        res.json(result);
      }
    }
  );
});

app.get("/combined-data", async (req, res) => {
  try {
    const initializeResponse = await fetch(
      "http://localhost:3001/initialize-database"
    );
    const transactionsResponse = await fetch(
      "http://localhost:3001/transactions?month=January"
    );
    const statisticsResponse = await fetch(
      "http://localhost:3001/statistics?month=January"
    );
    const barChartResponse = await fetch(
      "http://localhost:3001/bar-chart?month=January"
    );
    const pieChartResponse = await fetch(
      "http://localhost:3001/pie-chart?month=January"
    );

    const initializeData = await initializeResponse.json();
    const transactionsData = await transactionsResponse.json();
    const statisticsData = await statisticsResponse.json();
    const barChartData = await barChartResponse.json();
    const pieChartData = await pieChartResponse.json();

    const combinedData = {
      initializeData,
      transactionsData,
      statisticsData,
      barChartData,
      pieChartData,
    };

    res.json(combinedData);
  } catch (error) {
    console.error("Error fetching combined data:", error.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
