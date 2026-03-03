const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

const PORT = process.env.PORT || 3000;

// OpenAI for image analysis
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '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'
});

// Staff members with login credentials
const STAFF_MEMBERS = {
  sjay: { id: 'sjay', name: 'SJay', password: 'SJ-xK9m2024!', isAdmin: true },
  nouzen: { id: 'nouzen', name: 'Nouzen', password: 'NZ-pQr7vL3n!' },
  daedae: { id: 'daedae', name: 'DaeDae', password: 'DD-mWz8Y4kJ!' },
  kyzo: { id: 'kyzo', name: 'Kyzo', password: 'KZ-hTn5rX9q!' }
};

// Admin password
const ADMIN_PASSWORD = 'sofmun-Gitpox-syzto1';

// Product vouch values
const PRODUCT_VALUES = {
  'controller-macro': 3,
  'zero-delay': 1,
  'fps-boost': 1,
  'ping-optimizer': 1,
  'premium-utility': 1,
  'zero-delay-plus': 1,
  'aim-bundle': 1,
  'shotgun-pack': 1,
  'keyboard-macro': 1,
  'unknown': 1
};

// Database file
const DB_FILE = path.join(__dirname, 'vouches.json');

// Load/save database
function loadDatabase() {
  try {
    if (fs.existsSync(DB_FILE)) {
      return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Error loading database:', e);
  }
  return { 
    vouches: [], 
    staffEarnings: {
      sjay: { totalEarnings: 0, vouchCount: 0 },
      nouzen: { totalEarnings: 0, vouchCount: 0 },
      daedae: { totalEarnings: 0, vouchCount: 0 },
      kyzo: { totalEarnings: 0, vouchCount: 0 }
    },
    systemAlerts: []
  };
}

function saveDatabase() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  } catch (e) {
    console.error('Error saving database:', e);
  }
}

let db = loadDatabase();

// Ensure systemAlerts exists
if (!db.systemAlerts) db.systemAlerts = [];

// Add system alert
function addSystemAlert(staffId, message, type = 'warning') {
  const alert = {
    id: crypto.randomBytes(4).toString('hex'),
    staffId,
    message,
    type, // 'warning', 'error', 'info'
    timestamp: new Date().toISOString(),
    read: false
  };
  db.systemAlerts.push(alert);
  // Keep only last 100 alerts
  if (db.systemAlerts.length > 100) {
    db.systemAlerts = db.systemAlerts.slice(-100);
  }
  saveDatabase();
  return alert;
}

// ==========================================
// AUTH ROUTES
// ==========================================

// Staff login
app.post('/api/auth/login', (req, res) => {
  const { staffId, password } = req.body;
  
  const normalizedId = staffId?.toLowerCase();
  const staff = STAFF_MEMBERS[normalizedId];
  
  if (!staff) {
    return res.status(401).json({ success: false, error: 'Invalid credentials' });
  }
  
  if (staff.password !== password) {
    return res.status(401).json({ success: false, error: 'Invalid credentials' });
  }
  
  // Generate session token
  const token = crypto.randomBytes(32).toString('hex');
  
  res.json({ 
    success: true, 
    token,
    staffId: staff.id,
    name: staff.name,
    isAdmin: staff.isAdmin || false
  });
});

// Admin login
app.post('/api/auth/admin', (req, res) => {
  const { password } = req.body;
  
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, error: 'Invalid password' });
  }
  
  res.json({ success: true });
});

// ==========================================
// STAFF ROUTES (require staffId)
// ==========================================

// Get staff data (individual)
app.get('/api/staff/:staffId/data', (req, res) => {
  const { staffId } = req.params;
  const normalizedId = staffId.toLowerCase();
  
  if (!STAFF_MEMBERS[normalizedId]) {
    return res.status(404).json({ success: false, error: 'Staff not found' });
  }
  
  const earnings = db.staffEarnings[normalizedId] || { totalEarnings: 0, vouchCount: 0 };
  const vouches = db.vouches.filter(v => 
    v.staffInvolved?.includes(normalizedId) || v.submittedBy === normalizedId
  );
  const alerts = db.systemAlerts.filter(a => a.staffId === normalizedId || a.staffId === 'all');
  
  res.json({
    success: true,
    staff: {
      id: normalizedId,
      name: STAFF_MEMBERS[normalizedId].name,
      ...earnings
    },
    vouches: vouches.slice(-50), // Last 50
    alerts: alerts.slice(-20) // Last 20 alerts
  });
});

// Mark alerts as read
app.post('/api/staff/:staffId/alerts/read', (req, res) => {
  const { staffId } = req.params;
  const normalizedId = staffId.toLowerCase();
  
  db.systemAlerts.forEach(alert => {
    if (alert.staffId === normalizedId || alert.staffId === 'all') {
      alert.read = true;
    }
  });
  saveDatabase();
  
  res.json({ success: true });
});

// ==========================================
// VOUCH SUBMISSION ROUTES
// ==========================================

// Submit vouch from Discord bot
app.post('/api/vouch/discord', (req, res) => {
  try {
    const { staffId, product, amount, discordUserId, discordUsername, splitWith, rejected, rejectionReason } = req.body;
    
    const normalizedStaffId = staffId.toLowerCase();
    
    if (!STAFF_MEMBERS[normalizedStaffId]) {
      return res.status(400).json({ success: false, error: 'Invalid staff member' });
    }
    
    const vouch = {
      id: crypto.randomBytes(8).toString('hex'),
      submittedBy: normalizedStaffId,
      staffInvolved: splitWith || [normalizedStaffId],
      product: product || 'Unknown',
      isController: product === 'controller-macro',
      baseAmount: splitWith ? amount * splitWith.length : amount,
      earningsPerPerson: rejected ? 0 : amount,
      timestamp: new Date().toISOString(),
      source: 'discord',
      discordUserId,
      discordUsername,
      rejected: rejected || false,
      rejectionReason: rejectionReason || null
    };
    
    db.vouches.push(vouch);
    
    if (rejected) {
      // Add system alert for rejected vouch
      addSystemAlert(
        normalizedStaffId,
        `Vouch from ${discordUsername} was not counted: ${rejectionReason}`,
        'warning'
      );
    } else {
      // Update earnings
      db.staffEarnings[normalizedStaffId] = db.staffEarnings[normalizedStaffId] || { totalEarnings: 0, vouchCount: 0 };
      db.staffEarnings[normalizedStaffId].totalEarnings += amount;
      db.staffEarnings[normalizedStaffId].vouchCount++;
    }
    
    saveDatabase();
    
    console.log(`${rejected ? '⚠️ Rejected' : '✅'} Discord vouch: $${amount.toFixed(2)} to ${STAFF_MEMBERS[normalizedStaffId].name} from ${discordUsername}${rejected ? ` (${rejectionReason})` : ''}`);
    
    res.json({ 
      success: true, 
      vouch,
      message: rejected 
        ? `Vouch logged but not counted: ${rejectionReason}`
        : `$${amount.toFixed(2)} added to ${STAFF_MEMBERS[normalizedStaffId].name}`
    });
  } catch (error) {
    console.error('Discord vouch error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Analyze vouch image with AI
async function analyzeVouchWithAI(imageBase64, submitterName) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are analyzing a screenshot to verify it's a valid customer vouch/review for SJTweaks.

STAFF NAMES TO LOOK FOR (check who helped the customer):
- "sjay" or "sj" = SJAY
- "nouzen" = NOUZEN  
- "daedae" or "dae dae" or "dae" = DAEDAE
- "kyzo" = KYZO

Look for staff names mentioned in the vouch (customer thanking them, mentioning who helped, etc.)

A valid vouch typically contains:
- Customer saying thanks or praising the service
- Mention of a staff member who helped
- Possibly mentioning the product they bought

PRODUCTS (look for these):
- "controller macro" or "sj macro" = controller-macro ($3)
- "zero delay" = zero-delay ($1)
- "fps boost" = fps-boost ($1)  
- "ping optimizer" = ping-optimizer ($1)
- "premium utility" = premium-utility ($1)
- "zero delay plus" = zero-delay-plus ($1)
- "aim bundle" = aim-bundle ($1)
- "shotgun pack" = shotgun-pack ($1)
- "keyboard macro" = keyboard-macro ($1)

RESPOND IN THIS EXACT JSON FORMAT:
{
  "valid": true/false,
  "confidence": 0-100,
  "staffMentioned": ["sjay"] or [],
  "productMentioned": "zero-delay" or null,
  "isController": true/false,
  "reason": "brief explanation"
}`
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: `Analyze this vouch screenshot. The submitter claims to be: ${submitterName}` },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } }
          ]
        }
      ],
      max_tokens: 500
    });

    const content = response.choices[0].message.content;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return { valid: false, reason: 'Could not parse AI response' };
  } catch (error) {
    console.error('AI analysis error:', error);
    return { valid: false, reason: error.message };
  }
}

// Submit vouch with image (from website)
app.post('/api/vouches/submit', async (req, res) => {
  try {
    const { imageBase64 } = req.body;
    
    if (!imageBase64) {
      return res.status(400).json({ success: false, error: 'No image provided' });
    }
    
    console.log(`📸 Vouch submitted, analyzing with AI...`);
    
    const analysis = await analyzeVouchWithAI(imageBase64, 'unknown');
    console.log(`🤖 AI Analysis:`, analysis);
    
    if (!analysis.valid) {
      return res.json({ success: false, error: analysis.reason, analysis });
    }

    let staffInvolved = analysis.staffMentioned?.length > 0 
      ? analysis.staffMentioned.filter(s => STAFF_MEMBERS[s.toLowerCase()])
      : [];
    
    if (staffInvolved.length === 0) {
      return res.json({ success: false, error: 'Could not detect staff name in the vouch.', analysis });
    }
    
    staffInvolved = staffInvolved.map(s => s.toLowerCase());

    const product = analysis.productMentioned || 'unknown';
    const baseAmount = analysis.isController ? 3 : (PRODUCT_VALUES[product] || 1);
    const earningsPerPerson = baseAmount / staffInvolved.length;

    const vouch = {
      id: crypto.randomBytes(8).toString('hex'),
      submittedBy: staffInvolved[0],
      staffInvolved: staffInvolved,
      product: product,
      isController: analysis.isController || false,
      baseAmount,
      earningsPerPerson,
      timestamp: new Date().toISOString(),
      source: 'website',
      imageHash: crypto.createHash('md5').update(imageBase64.substring(0, 1000)).digest('hex')
    };

    db.vouches.push(vouch);

    // Update earnings for all involved staff
    staffInvolved.forEach(id => {
      db.staffEarnings[id] = db.staffEarnings[id] || { totalEarnings: 0, vouchCount: 0 };
      db.staffEarnings[id].totalEarnings += earningsPerPerson;
      db.staffEarnings[id].vouchCount++;
    });

    saveDatabase();

    const staffNames = staffInvolved.map(s => STAFF_MEMBERS[s]?.name || s);
    let message;
    
    if (staffInvolved.length === 1) {
      message = `$${baseAmount.toFixed(2)} has been added to ${staffNames[0]}'s earnings!`;
    } else {
      message = `$${earningsPerPerson.toFixed(2)} each has been added to ${staffNames.join(' & ')}! (split from $${baseAmount.toFixed(2)})`;
    }

    console.log(`✅ ${message}`);

    res.json({ 
      success: true, 
      vouch,
      analysis,
      message,
      staffCredited: staffNames,
      amountPerPerson: earningsPerPerson,
      product
    });
  } catch (error) {
    console.error('Error submitting vouch:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ==========================================
// ADMIN ROUTES
// ==========================================

// Get all data (admin)
app.post('/api/vouches/admin', (req, res) => {
  const { password } = req.body;
  
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, error: 'Invalid password' });
  }
  
  const staffData = Object.entries(STAFF_MEMBERS).map(([id, info]) => ({
    id,
    name: info.name,
    ...(db.staffEarnings[id] || { totalEarnings: 0, vouchCount: 0 })
  }));
  
  res.json({
    success: true,
    staff: staffData,
    recentVouches: db.vouches.slice(-100),
    systemAlerts: db.systemAlerts.slice(-50)
  });
});

// Delete a vouch (admin)
app.delete('/api/admin/vouch/:vouchId', (req, res) => {
  const { password } = req.body;
  const { vouchId } = req.params;
  
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, error: 'Invalid password' });
  }
  
  const vouchIndex = db.vouches.findIndex(v => v.id === vouchId);
  if (vouchIndex === -1) {
    return res.status(404).json({ success: false, error: 'Vouch not found' });
  }
  
  const vouch = db.vouches[vouchIndex];
  
  // Subtract earnings if not rejected
  if (!vouch.rejected && vouch.staffInvolved) {
    vouch.staffInvolved.forEach(staffId => {
      if (db.staffEarnings[staffId]) {
        db.staffEarnings[staffId].totalEarnings -= vouch.earningsPerPerson;
        db.staffEarnings[staffId].vouchCount--;
      }
    });
  }
  
  db.vouches.splice(vouchIndex, 1);
  saveDatabase();
  
  res.json({ success: true });
});

// Reset staff earnings (admin)
app.post('/api/admin/reset/:staffId', (req, res) => {
  const { password } = req.body;
  const { staffId } = req.params;
  
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, error: 'Invalid password' });
  }
  
  if (staffId === 'all') {
    Object.keys(db.staffEarnings).forEach(id => {
      db.staffEarnings[id] = { totalEarnings: 0, vouchCount: 0 };
    });
    db.vouches = [];
    db.systemAlerts = [];
  } else {
    db.staffEarnings[staffId] = { totalEarnings: 0, vouchCount: 0 };
    db.vouches = db.vouches.filter(v => !v.staffInvolved?.includes(staffId));
  }
  
  saveDatabase();
  res.json({ success: true });
});

// ==========================================
// SERVE FRONTEND
// ==========================================

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Staff Vouch Server running on port ${PORT}`);
  console.log(`📊 Loaded ${db.vouches.length} vouches`);
});
