const express = require('express');
const mysql = require('mysql');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json()); // to parse JSON data

// MySQL connection pool
const db = mysql.createPool({
  connectionLimit: 10,
  host: 'srv1370.hstgr.io',
  user: 'u868697291_kn',
  password: 'Solo2023@@',
  database: 'u868697291_kn'
});

// POST route to save user data with auto-generated referral code
app.post('/saveUserData', (req, res) => {
  const {
    id, first_name, last_name, username, levelIndex, points, profitPerHour, multitapLevel, energy, maxEnergyLevel, maxEnergy
  } = req.body;

  const sqlInsertUser = `INSERT INTO user_data (id, first_name, last_name, username, levelIndex, points, profitPerHour, multitapLevel, energy, maxEnergyLevel, maxEnergy)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                         ON DUPLICATE KEY UPDATE first_name = VALUES(first_name), last_name = VALUES(last_name), username = VALUES(username),
                         levelIndex = VALUES(levelIndex), points = VALUES(points), profitPerHour = VALUES(profitPerHour),
                         multitapLevel = VALUES(multitapLevel), energy = VALUES(energy), maxEnergyLevel = VALUES(maxEnergyLevel), maxEnergy = VALUES(maxEnergy)`;

  const referralCode = `${Math.floor(100000 + Math.random() * 900000)}`; // 6-digit referral code
  const sqlInsertReferral = `INSERT INTO referral_codes (user_id, referral_code, referral_count)
                             SELECT ?, ?, 0 FROM DUAL WHERE NOT EXISTS (SELECT * FROM referral_codes WHERE user_id = ?)`;

  db.query(sqlInsertUser, [id, first_name, last_name, username, levelIndex, points, profitPerHour, multitapLevel, energy, maxEnergyLevel, maxEnergy], (err) => {
    if (err) return res.status(500).send(err);

    // Insert referral code if not exists
    db.query(sqlInsertReferral, [id, referralCode, id], (err) => {
      if (err) return res.status(500).send('Error saving referral code');
      res.send('User data and referral code saved successfully!');
    });
  });
});

// GET: Fetch user data
app.get('/getUserData/:id', (req, res) => {
  const userId = req.params.id;

  const userDataQuery = 
    `SELECT id, first_name, last_name, username, levelIndex, 
           IFNULL(updatedPoints, points) AS points, 
           profitPerHour, multitapLevel, energy, 
           maxEnergyLevel, maxEnergy, lastActiveTime 
    FROM user_data WHERE id = ?`;

  const claimedRewardsQuery = 
    `SELECT reward_title FROM claimed_rewards WHERE user_id = ?`;

  db.query(userDataQuery, [userId], (err, userDataResult) => {
    if (err) return res.status(500).send('Error fetching user data');

    if (userDataResult.length === 0) {
      return res.status(404).send('User not found');
    }

    // Fetch claimed rewards
    db.query(claimedRewardsQuery, [userId], (err, claimedRewardsResult) => {
      if (err) return res.status(500).send('Error fetching claimed rewards');

      const claimedRewards = claimedRewardsResult.map(reward => reward.reward_title);
      res.json({ ...userDataResult[0], claimedRewards });
    });
  });
});

// POST: Save updated points
app.post('/saveUpdatedPoints', (req, res) => {
  const { userId, updatedPoints } = req.body;

  const query = 'UPDATE user_data SET points = ? WHERE id = ?';
  db.query(query, [updatedPoints, userId], (err) => {
    if (err) return res.status(500).send('Error updating points');
    res.send('Points updated successfully');
  });
});

// POST: Save last active time
app.post('/saveLastActiveTime', (req, res) => {
  const { userId, lastActiveTime } = req.body;

  const query = 'UPDATE user_data SET lastActiveTime = ? WHERE id = ?';
  db.query(query, [lastActiveTime, userId], (err) => {
    if (err) return res.status(500).send('Error saving last active time');
    res.send('Last active time saved successfully');
  });
});

// POST: Save updated points and energy
app.post('/saveUpdatedPointsAndEnergy', (req, res) => {
  const { userId, updatedPoints, updatedEnergy } = req.body;

  const query = 
    `UPDATE user_data 
    SET points = ?, energy = ? 
    WHERE id = ?`;

  db.query(query, [updatedPoints, updatedEnergy, userId], (err) => {
    if (err) {
      return res.status(500).send('Error saving points and energy');
    }
    res.send('Points and energy updated successfully');
  });
});

// POST: Save updated energy
app.post('/saveUpdatedEnergy', (req, res) => {
  const { userId, updatedEnergy } = req.body;

  const updateQuery = 
    `UPDATE user_data 
    SET energy = ? 
    WHERE id = ?`;

  db.query(updateQuery, [updatedEnergy, userId], (err, result) => {
    if (err) {
      return res.status(500).send('Error updating energy');
    }
    res.send('Energy updated successfully');
  });
});

// POST: Claim task and update user points
app.post('/claimTask', (req, res) => {
  const { userId, taskTitle, taskReward } = req.body;

  const checkClaimedTaskQuery = 'SELECT * FROM claimed_tasks WHERE user_id = ? AND task_title = ?';
  db.query(checkClaimedTaskQuery, [userId, taskTitle], (err, result) => {
    if (err) {
      return res.status(500).json({ error: 'Error checking claimed tasks' });
    }

    if (result.length > 0) {
      return res.status(400).json({ error: 'Task already claimed' });
    }

    const updatePointsQuery = 'UPDATE user_data SET points = points + ? WHERE id = ?';
    db.query(updatePointsQuery, [taskReward, userId], (err) => {
      if (err) {
        return res.status(500).json({ error: 'Error updating points' });
      }

      const saveClaimedTaskQuery = 'INSERT INTO claimed_tasks (user_id, task_title) VALUES (?, ?)';
      db.query(saveClaimedTaskQuery, [userId, taskTitle], (err) => {
        if (err) {
          return res.status(500).json({ error: 'Error saving claimed task' });
        }

        res.json({ success: true, message: 'Task claimed successfully!' });
      });
    });
  });
});

// GET: Fetch claimed tasks for a user
app.get('/claimedTasks/:userId', (req, res) => {
  const { userId } = req.params;

  const query = 'SELECT task_title FROM claimed_tasks WHERE user_id = ?';
  db.query(query, [userId], (err, result) => {
    if (err) {
      return res.status(500).json({ error: 'Error fetching claimed tasks' });
    }

    res.json(result.map(task => task.task_title));
  });
});

// POST: Generate referral code
app.post('/generateReferralCode', (req, res) => {
  const { user_id } = req.body;

  const checkSql = 'SELECT referral_code FROM referral_codes WHERE user_id = ?';

  db.query(checkSql, [user_id], (err, result) => {
    if (err) return res.status(500).send('Error checking referral code');

    if (result.length > 0) {
      return res.status(400).send('Referral code already exists');
    }

    const referralCode = `${Math.floor(100000 + Math.random() * 900000)}`;
    const insertSql = 'INSERT INTO referral_codes (user_id, referral_code, referral_count) VALUES (?, ?, 0)';

    db.query(insertSql, [user_id, referralCode], (err) => {
      if (err) return res.status(500).send('Error saving referral code');
      res.json({ referralCode });
    });
  });
});

// GET: Fetch referrals for a user
app.get('/getReferrals/:user_id', (req, res) => {
  const { user_id } = req.params;

  const sql = 
    `SELECT u.first_name, u.username, u.levelIndex
    FROM referrals r
    JOIN user_data u ON r.referee_id = u.id
    WHERE r.referrer_id = ?`;

  db.query(sql, [user_id], (err, results) => {
    if (err) return res.status(500).send('Error fetching referrals');
    res.json(results);
  });
});

// POST: Submit referral code
app.post('/submitReferralCode', (req, res) => {
  const { referral_code, referee_id } = req.body;

  const findCodeSql = 'SELECT user_id FROM referral_codes WHERE referral_code = ?';
  db.query(findCodeSql, [referral_code], (err, result) => {
    if (err || result.length === 0) return res.status(400).send('Invalid referral code');

    const referrer_id = result[0].user_id;
    const insertReferralSql = 'INSERT INTO referrals (referrer_id, referee_id) VALUES (?, ?)';

    db.query(insertReferralSql, [referrer_id, referee_id], (err) => {
      if (err) return res.status(500).send('Error saving referral');

      const incrementReferralCountSql = 'UPDATE referral_codes SET referral_count = referral_count + 1 WHERE referral_code = ?';
      db.query(incrementReferralCountSql, [referral_code], (err) => {
        if (err) return res.status(500).send('Error updating referral count');
        res.send('Referral submitted successfully!');
      });
    });
  });
});

// GET: Fetch referral code and referral count
app.get('/getReferralCode/:user_id', (req, res) => {
  const userId = req.params.user_id;
  const sql = 'SELECT referral_code, referral_count FROM referral_codes WHERE user_id = ?';
  db.query(sql, [userId], (err, result) => {
    if (err) {
      console.error('Error fetching referral code:', err);
      return res.status(500).send('Error fetching referral code');
    }
    if (result.length === 0) {
      return res.status(404).send('No referral code found');
    }
    res.json({ referralCode: result[0].referral_code, referralCount: result[0].referral_count });
  });
});

// POST: Save updated profitPerHour to the database
app.post('/saveProfitPerHour', (req, res) => {
  const { userId, profitPerHour } = req.body;

  const sqlUpdateProfit = 'UPDATE user_data SET profitPerHour = ? WHERE id = ?';

  db.query(sqlUpdateProfit, [profitPerHour, userId], (err, result) => {
    if (err) {
      console.error('Error updating profit per hour:', err);
      return res.status(500).send('Error updating profit per hour');
    }
    res.send('Profit per hour updated successfully');
  });
});

// POST: Save updated profitPerHour to the database
app.post('/saveUserProfit', (req, res) => {
  const { userId, profitPerHour } = req.body;

  console.log('Received data:', { userId, profitPerHour });  // Add this to debug

  // Check if userId and profitPerHour are valid
  if (!userId || !Number.isFinite(profitPerHour)) {
    return res.status(400).send('Invalid input');
  }

  const sqlUpdate = 'UPDATE user_data SET profitPerHour = ? WHERE id = ?';
  db.query(sqlUpdate, [profitPerHour, userId], (err, result) => {
    if (err) {
      console.error('Error updating profit per hour:', err);
      return res.status(500).send('Error updating profit per hour');
    }
    res.send('Profit per hour updated successfully');
  });
});

// POST: Save claimed reward
app.post('/saveClaimedReward', (req, res) => {
  const { userId, rewardTitle } = req.body;

  const checkIfClaimed = 'SELECT * FROM claimed_rewards WHERE user_id = ? AND reward_title = ?';
  const insertRewardQuery = 'INSERT INTO claimed_rewards (user_id, reward_title) VALUES (?, ?)';

  db.query(checkIfClaimed, [userId, rewardTitle], (err, result) => {
    if (err) {
      return res.status(500).send('Error checking claimed rewards');
    }
    if (result.length > 0) {
      return res.status(400).send('Reward already claimed');
    }

    db.query(insertRewardQuery, [userId, rewardTitle], (err, result) => {
      if (err) {
        return res.status(500).send('Error saving claimed reward');
      }
      res.send('Claimed reward saved successfully!');
    });
  });
});

// GET: Fetch claimed rewards for a specific user
app.get('/getClaimedRewards/:user_id', (req, res) => {
  const userId = req.params.user_id;

  const sql = 'SELECT reward_title FROM claimed_rewards WHERE user_id = ?';
  db.query(sql, [userId], (err, results) => {
    if (err) {
      console.error('Error fetching claimed rewards:', err);
      return res.status(500).send('Error fetching claimed rewards');
    }
    res.json(results.map(reward => reward.reward_title));
  });
});

// Allowed level names for validation
const allowedLevelNames = [
  'founderLevel', 'devLevel', 'marketingLevel', 'modsLevel', 'influencersLevel', 
  'xLevel', 'youtubeLevel', 'tiktokLevel', 'stablecoinsLevel', 'cryptocurrenciesLevel', 
  'miningLevel', 'tokensLevel', 'hashrateLevel', 'walletsLevel', 'memeCoinsLevel', 
  'leverageLevel', 'dexLevel', 'smartLevel', 'oracleLevel', 'nftsLevel', 'yieldLevel', 
  'stakingLevel', 'launchpadLevel', 'daoLevel', 'satoshiLevel', 'vitalikLevel', 
  'ponziesLevel', 'rugsLevel', 'hacksLevel', 'chairsLevel', 'maximalismLevel', 'cultsLevel'
];

// Fetch user levels (for Harvest)
app.get('/getUserLevels/:userId', (req, res) => {
  const { userId } = req.params;

  // First, ensure the user exists in the user_data table
  const checkUserExistence = 'SELECT * FROM user_data WHERE id = ?';

  db.query(checkUserExistence, [userId], (err, results) => {
    if (err) {
      console.error('Error checking user existence:', err);
      return res.status(500).send('Error checking user existence');
    }
    if (results.length === 0) {
      return res.status(404).send('User does not exist in user_data');
    }

    // If the user exists, proceed to fetch or insert levels
    const query = 'SELECT * FROM user_levels WHERE user_id = ?';

    db.query(query, [userId], (err, results) => {
      if (err) {
        console.error('Error fetching user levels:', err);
        return res.status(500).send('Error fetching user levels');
      } else if (results.length > 0) {
        res.json(results[0]);  // Return the user levels as JSON
      } else {
        // If no user levels exist for the user, create an empty entry
        const createQuery = 'INSERT INTO user_levels (user_id) VALUES (?)';
        db.query(createQuery, [userId], (err, insertResults) => {
          if (err) {
            console.error('Error creating user levels:', err);
            return res.status(500).send('Error creating user levels');
          }
          res.json({});  // Return an empty levels object
        });
      }
    });
  });
});

// Save user level
app.post('/saveUserLevel', (req, res) => {
  const { userId, levelName, levelValue, profitPerHour } = req.body;

  const query = `UPDATE user_levels SET ${db.escapeId(levelName)} = ? WHERE user_id = ?`;
  const profitUpdateQuery = 'UPDATE user_data SET profitPerHour = ? WHERE id = ?';

  db.query(query, [levelValue, userId], (err, results) => {
    if (err) {
      console.error('Error saving user level:', err);
      res.status(500).send('Error saving user level');
    } else {
      // After saving the level, update the profitPerHour
      db.query(profitUpdateQuery, [profitPerHour, userId], (profitErr) => {
        if (profitErr) {
          console.error('Error updating profitPerHour:', profitErr);
          res.status(500).send('Error updating profitPerHour');
        } else {
          res.send('Level and profitPerHour updated successfully');
        }
      });
    }
  });
});

// POST: Save updated level and profitPerHour to the database
app.post('/saveLevelsIncreaseProfit', (req, res) => {
  const { userId, profitPerHour, levelName, levelValue } = req.body;

  const updateProfitQuery = 'UPDATE user_data SET profitPerHour = ? WHERE id = ?';
  const updateLevelQuery = `UPDATE user_levels SET ${db.escapeId(levelName)} = ? WHERE user_id = ?`;

  db.query(updateProfitQuery, [profitPerHour, userId], (err) => {
    if (err) {
      console.error('Error updating profit per hour:', err);
      return res.status(500).send('Error updating profit per hour');
    }

    db.query(updateLevelQuery, [levelValue, userId], (err) => {
      if (err) {
        console.error('Error updating user level:', err);
        return res.status(500).send('Error updating user level');
      }

      res.send('Profit per hour and level updated successfully');
    });
  });
});


// Start the server
app.listen(3000, () => {
  console.log('Server running on port 3000');
});
