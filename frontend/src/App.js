import React, { useState, useEffect } from 'react';
import { Container, Grid, Paper, Typography, Button, TextField, Box, Snackbar, Alert, Table, TableBody, TableCell, TableHead, TableRow, Chip, CircularProgress, IconButton, Divider, Card, CardContent, CardHeader, Tooltip, Badge, Switch, FormControlLabel, LinearProgress, Tabs, Tab, Menu, MenuItem, Select, FormControl, InputLabel, Collapse, TableContainer, useMediaQuery } from '@mui/material';
import { ThemeProvider, createTheme, useTheme } from '@mui/material/styles';
import { styled } from '@mui/system';
import axios from 'axios';
import io from 'socket.io-client';
import { Timeline, TimelineItem, TimelineSeparator, TimelineConnector, TimelineContent, TimelineDot } from '@mui/lab';
import { TrendingUp, TrendingDown, Refresh, Settings, ShowChart, Assessment, Warning, CheckCircle, Error as ErrorIcon, FilterList, Search, Download, DateRange, ArrowUpward, ArrowDownward, History as HistoryIcon } from '@mui/icons-material';
import { 
  BarChart, Bar, 
  LineChart, Line, 
  XAxis, YAxis, 
  CartesianGrid, Tooltip as RechartsTooltip, 
  Legend, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { TableSortLabel } from '@mui/material';

const useResponsive = () => {
  const theme = useTheme();
  return {
    isMobile: useMediaQuery(theme.breakpoints.down('sm')),
    isTablet: useMediaQuery(theme.breakpoints.between('sm', 'md')),
    isDesktop: useMediaQuery(theme.breakpoints.up('md')),
    isLargeScreen: useMediaQuery(theme.breakpoints.up('lg'))
  };
};

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
  },
  typography: {
    h4: {
      fontSize: '2rem',
      '@media (max-width:600px)': {
        fontSize: '1.5rem',
      },
    },
    h6: {
      fontSize: '1.25rem',
      '@media (max-width:600px)': {
        fontSize: '1.1rem',
      },
    }
  },
  components: {
    MuiContainer: {
      styleOverrides: {
        root: {
          '@media (max-width:600px)': {
            padding: '8px',
          },
        },
      },
    },
  },
});

const StyledPaper = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(2),
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  [theme.breakpoints.down('sm')]: {
    padding: theme.spacing(1),
  },
}));

function App() {
  const { isMobile, isTablet, isDesktop } = useResponsive();
  const [isTrading, setIsTrading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('Connecting...');
  const [marketData, setMarketData] = useState(null);
  const [priceHistory, setPriceHistory] = useState(() => {
    try {
      const savedHistory = localStorage.getItem('priceHistory');
      const parsed = savedHistory ? JSON.parse(savedHistory) : [];
      // Filter out invalid entries
      return parsed.filter(point => point.price > 0).slice(-100);
    } catch (error) {
      console.error('Error loading price history:', error);
      return [];
    }
  });
  const [settings, setSettings] = useState({
    callEntryPercent: 1.0,
    putEntryPercent: 1.0,
    callStopLossPercent: 1.3,
    putStopLossPercent: 1.3
  });
  const [positions, setPositions] = useState([]);
  const [notification, setNotification] = useState({ open: false, message: '', type: 'info' });
  const [error, setError] = useState(null);
  const [tradeHistory, setTradeHistory] = useState([]);
  const [pnl, setPnL] = useState({ daily: 0, total: 0 });
  const [selectedTab, setSelectedTab] = useState(0);
  const [timeframe, setTimeframe] = useState('1D');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [systemHealth, setSystemHealth] = useState({
    cpu: 45,
    memory: 60,
    latency: 120,
    uptime: '2h 45m'
  });
  const [alerts, setAlerts] = useState([
    { type: 'warning', message: 'High volatility detected', time: new Date() },
    { type: 'error', message: 'Connection interrupted', time: new Date(Date.now() - 300000) },
    { type: 'success', message: 'Trade executed successfully', time: new Date(Date.now() - 600000) }
  ]);
  const [tradingStats, setTradingStats] = useState({
    winRate: 65,
    avgProfit: 250,
    avgLoss: 150,
    maxDrawdown: 1200,
    profitFactor: 1.8
  });
  const [historyFilters, setHistoryFilters] = useState({
    startDate: null,
    endDate: null,
    tradeType: 'all',
    status: 'all',
    searchQuery: '',
    sortBy: 'date',
    sortOrder: 'desc'
  });

  // Update localStorage when price history changes
  useEffect(() => {
    try {
      // Only save valid price points
      const validHistory = priceHistory.filter(point => point.price > 0);
      localStorage.setItem('priceHistory', JSON.stringify(validHistory));
    } catch (error) {
      console.error('Error saving price history:', error);
    }
  }, [priceHistory]);

  useEffect(() => {
    console.log('Initializing WebSocket connection...');
    const socket = io('http://localhost:3000', {
      transports: ['websocket']
    });

    socket.on('connect', () => {
      console.log('WebSocket Connected, Socket ID:', socket.id);
      setConnectionStatus('Connected');
      setError(null);
    });

    socket.on('disconnect', () => {
      console.log('WebSocket Disconnected');
      setConnectionStatus('Disconnected');
    });

    socket.on('connect_error', (error) => {
      console.error('Connection Error:', error);
      setConnectionStatus('Connection Error');
      setError(error.message);
    });

    socket.on('marketData', (data) => {
      console.log('Received market data:', data);
      if (data?.data?.ltp && isValidPrice(data.data.ltp)) {
        setMarketData(data);
        setPriceHistory(prev => {
          const newPoint = {
            time: new Date().toLocaleTimeString(),
            price: data.data.ltp,
            change: data.data.change
          };
          // Filter out invalid prices
          const filtered = prev.filter(p => isValidPrice(p.price));
          return [...filtered, newPoint].slice(-100);
        });
      }
    });

    return () => {
      console.log('Cleaning up socket connection');
      socket.disconnect();
    };
  }, []);

  // Add a debug useEffect for price history
  useEffect(() => {
    console.log('Current price history:', priceHistory);
  }, [priceHistory]);

  // Add function to fetch positions
  const fetchPositions = async () => {
    try {
      const response = await axios.get('http://localhost:3000/api/trading/positions');
      setPositions(response.data);
    } catch (error) {
      console.error('Error fetching positions:', error);
    }
  };

  const handleSettingChange = (setting) => (event) => {
    setSettings(prev => ({
      ...prev,
      [setting]: parseFloat(event.target.value)
    }));
  };

  const handleStartTrading = async () => {
    try {
      await axios.post('http://localhost:3000/api/trading/start', settings);
      setIsTrading(true);
    } catch (error) {
      console.error('Error starting trading:', error);
    }
  };

  const handleStopTrading = async () => {
    try {
      await axios.post('http://localhost:3000/api/trading/stop');
      setIsTrading(false);
    } catch (error) {
      console.error('Error stopping trading:', error);
    }
  };

  const handleCloseNotification = () => {
    setNotification(prev => ({ ...prev, open: false }));
  };

  const isValidPrice = (price) => {
    return typeof price === 'number' && 
           price > 0 && 
           price < 1000000 && // Maximum reasonable price
           !isNaN(price) &&
           isFinite(price);
  };

  const formatPrice = (price) => {
    return price.toLocaleString('en-IN', {
      maximumFractionDigits: 2,
      minimumFractionDigits: 2
    });
  };

  useEffect(() => {
    const fetchTradeData = async () => {
      try {
        const [historyRes, pnlRes] = await Promise.all([
          axios.get('http://localhost:3000/api/trading/trades/history'),
          axios.get('http://localhost:3000/api/trading/trades/pnl')
        ]);
        setTradeHistory(historyRes.data);
        setPnL(pnlRes.data);
      } catch (error) {
        console.error('Error fetching trade data:', error);
      }
    };

    fetchTradeData();
    const interval = setInterval(fetchTradeData, 30000); // Update every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const SystemHealthCard = ({ isMobile }) => (
    <Card>
      <CardHeader 
        title="System Health" 
        action={
          <IconButton onClick={() => setAutoRefresh(!autoRefresh)}>
            <Refresh />
          </IconButton>
        }
      />
      <CardContent>
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2">CPU Usage</Typography>
          <LinearProgress 
            variant="determinate" 
            value={systemHealth.cpu}
            color={systemHealth.cpu > 80 ? 'error' : 'primary'}
          />
        </Box>
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2">Memory Usage</Typography>
          <LinearProgress 
            variant="determinate" 
            value={systemHealth.memory}
            color={systemHealth.memory > 80 ? 'error' : 'primary'}
          />
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Typography variant="body2">
            Latency: {systemHealth.latency}ms
          </Typography>
          <Typography variant="body2">
            Uptime: {systemHealth.uptime}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );

  const TradingStatsCard = ({ isMobile }) => (
    <Card>
      <CardHeader title="Trading Statistics" />
      <CardContent>
        <Grid container spacing={2}>
          <Grid item xs={6}>
            <Typography variant="body2" color="textSecondary">Win Rate</Typography>
            <Typography variant={isMobile ? "h6" : "h5"}>{tradingStats.winRate}%</Typography>
          </Grid>
          <Grid item xs={6}>
            <Typography variant="body2" color="textSecondary">Profit Factor</Typography>
            <Typography variant={isMobile ? "h6" : "h5"}>{tradingStats.profitFactor}</Typography>
          </Grid>
          <Grid item xs={6}>
            <Typography variant="body2" color="textSecondary">Avg Profit</Typography>
            <Typography variant="h6" color="success.main">₹{tradingStats.avgProfit}</Typography>
          </Grid>
          <Grid item xs={6}>
            <Typography variant="body2" color="textSecondary">Avg Loss</Typography>
            <Typography variant="h6" color="error.main">₹{tradingStats.avgLoss}</Typography>
          </Grid>
          <Grid item xs={12}>
            <Typography variant="body2" color="textSecondary">Max Drawdown</Typography>
            <Typography variant="h6" color="warning.main">₹{tradingStats.maxDrawdown}</Typography>
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  );

  const AlertsTimeline = ({ isMobile }) => (
    <Card>
      <CardHeader 
        title="System Alerts" 
        action={
          <Badge badgeContent={alerts.length} color="error">
            <Warning />
          </Badge>
        }
      />
      <CardContent>
        <Timeline>
          {alerts.map((alert, index) => (
            <TimelineItem key={index}>
              <TimelineSeparator>
                <TimelineDot color={alert.type}>
                  {alert.type === 'warning' && <Warning />}
                  {alert.type === 'error' && <ErrorIcon />}
                  {alert.type === 'success' && <CheckCircle />}
                </TimelineDot>
                {index < alerts.length - 1 && <TimelineConnector />}
              </TimelineSeparator>
              <TimelineContent>
                <Typography variant="body2">{alert.message}</Typography>
                <Typography variant="caption" color="textSecondary">
                  {new Date(alert.time).toLocaleTimeString()}
                </Typography>
              </TimelineContent>
            </TimelineItem>
          ))}
        </Timeline>
      </CardContent>
    </Card>
  );

  const AnalyticsView = ({ tradeHistory, tradingStats, isMobile }) => {
    const COLORS = ['#00C49F', '#FF8042', '#0088FE', '#FFBB28'];

    const profitLossData = tradeHistory.map(trade => ({
      time: new Date(trade.entry_time).toLocaleDateString(),
      pnl: trade.profit_loss || 0
    }));

    const tradeTypeData = [
      { name: 'Profitable Calls', value: tradingStats.profitableCalls || 0 },
      { name: 'Loss Calls', value: tradingStats.lossCalls || 0 },
      { name: 'Profitable Puts', value: tradingStats.profitablePuts || 0 },
      { name: 'Loss Puts', value: tradingStats.lossPuts || 0 }
    ];

    return (
      <Grid container spacing={3}>
        {/* P&L Chart */}
        <Grid item xs={12} md={8}>
          <Card>
            <CardHeader title="Profit/Loss Over Time" />
            <CardContent sx={{ height: 400 }}>
              <ResponsiveContainer>
                <LineChart data={profitLossData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" />
                  <YAxis />
                  <RechartsTooltip />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="pnl" 
                    stroke="#8884d8" 
                    name="P&L"
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>

        {/* Trade Distribution */}
        <Grid item xs={12} md={4}>
          <Card>
            <CardHeader title="Trade Distribution" />
            <CardContent sx={{ height: 400 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={tradeTypeData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label
                  >
                    {tradeTypeData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>

        {/* Performance Metrics */}
        <Grid item xs={12}>
          <Card>
            <CardHeader title="Performance Metrics" />
            <CardContent>
              <Grid container spacing={3}>
                <Grid item xs={12} md={3}>
                  <Box sx={{ textAlign: 'center', p: 2 }}>
                    <Typography variant={isMobile ? "h4" : "h5"} color="success.main">
                      {tradingStats.winRate}%
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                      Win Rate
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={12} md={3}>
                  <Box sx={{ textAlign: 'center', p: 2 }}>
                    <Typography variant={isMobile ? "h4" : "h5"} color="primary.main">
                      {tradingStats.profitFactor.toFixed(2)}
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                      Profit Factor
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={12} md={3}>
                  <Box sx={{ textAlign: 'center', p: 2 }}>
                    <Typography variant={isMobile ? "h4" : "h5"} color="warning.main">
                      ₹{tradingStats.maxDrawdown}
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                      Max Drawdown
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={12} md={3}>
                  <Box sx={{ textAlign: 'center', p: 2 }}>
                    <Typography variant={isMobile ? "h4" : "h5"} color="info.main">
                      {tradingStats.totalTrades}
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                      Total Trades
                    </Typography>
                  </Box>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    );
  };

  const HistoryView = ({ tradeHistory, isMobile }) => {
    const [filters, setFilters] = useState(historyFilters);
    const [showFilters, setShowFilters] = useState(false);

    const filteredTrades = tradeHistory.filter(trade => {
      if (filters.searchQuery) {
        const query = filters.searchQuery.toLowerCase();
        if (!trade.instrument.toLowerCase().includes(query) &&
            !trade.trade_type.toLowerCase().includes(query) &&
            !trade.status.toLowerCase().includes(query)) {
          return false;
        }
      }

      if (filters.startDate && new Date(trade.entry_time) < filters.startDate) {
        return false;
      }

      if (filters.endDate && new Date(trade.entry_time) > filters.endDate) {
        return false;
      }

      if (filters.tradeType !== 'all' && trade.trade_type !== filters.tradeType) {
        return false;
      }

      if (filters.status !== 'all' && trade.status !== filters.status) {
        return false;
      }

      return true;
    }).sort((a, b) => {
      const sortOrder = filters.sortOrder === 'asc' ? 1 : -1;
      switch (filters.sortBy) {
        case 'date':
          return sortOrder * (new Date(b.entry_time) - new Date(a.entry_time));
        case 'profit':
          return sortOrder * ((b.profit_loss || 0) - (a.profit_loss || 0));
        case 'instrument':
          return sortOrder * a.instrument.localeCompare(b.instrument);
        default:
          return 0;
      }
    });

    const handleExport = () => {
      const csv = [
        ['Date', 'Instrument', 'Type', 'Entry Price', 'Exit Price', 'P&L', 'Status'],
        ...filteredTrades.map(trade => [
          new Date(trade.entry_time).toLocaleString(),
          trade.instrument,
          trade.trade_type,
          trade.entry_price,
          trade.exit_price || '',
          trade.profit_loss || '',
          trade.status
        ])
      ].map(row => row.join(',')).join('\n');

      const blob = new Blob([csv], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `trade_history_${new Date().toISOString()}.csv`;
      a.click();
    };

    return (
      <Box>
        {/* Filters Section */}
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
              <Box sx={{ display: 'flex', gap: 2 }}>
                <TextField
                  size={isMobile ? "small" : "medium"}
                  placeholder="Search trades..."
                  value={filters.searchQuery}
                  onChange={(e) => setFilters(prev => ({ ...prev, searchQuery: e.target.value }))}
                  InputProps={{
                    startAdornment: <Search sx={{ mr: 1 }} />
                  }}
                />
                <Button
                  variant="outlined"
                  startIcon={<FilterList />}
                  onClick={() => setShowFilters(!showFilters)}
                >
                  Filters
                </Button>
              </Box>
              <Button
                variant="contained"
                startIcon={<Download />}
                onClick={handleExport}
              >
                Export CSV
              </Button>
            </Box>

            <Collapse in={showFilters}>
              <Grid container spacing={2} sx={{ mt: 2 }}>
                <Grid item xs={12} md={3}>
                  <LocalizationProvider dateAdapter={AdapterDateFns}>
                    <DatePicker
                      label="Start Date"
                      value={filters.startDate}
                      onChange={(date) => setFilters(prev => ({ ...prev, startDate: date }))}
                      renderInput={(params) => <TextField {...params} fullWidth size={isMobile ? "small" : "medium"} />}
                    />
                  </LocalizationProvider>
                </Grid>
                <Grid item xs={12} md={3}>
                  <LocalizationProvider dateAdapter={AdapterDateFns}>
                    <DatePicker
                      label="End Date"
                      value={filters.endDate}
                      onChange={(date) => setFilters(prev => ({ ...prev, endDate: date }))}
                      renderInput={(params) => <TextField {...params} fullWidth size={isMobile ? "small" : "medium"} />}
                    />
                  </LocalizationProvider>
                </Grid>
                <Grid item xs={12} md={3}>
                  <FormControl fullWidth size={isMobile ? "small" : "medium"}>
                    <InputLabel>Trade Type</InputLabel>
                    <Select
                      value={filters.tradeType}
                      onChange={(e) => setFilters(prev => ({ ...prev, tradeType: e.target.value }))}
                      label="Trade Type"
                    >
                      <MenuItem value="all">All</MenuItem>
                      <MenuItem value="CALL">Call</MenuItem>
                      <MenuItem value="PUT">Put</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} md={3}>
                  <FormControl fullWidth size={isMobile ? "small" : "medium"}>
                    <InputLabel>Status</InputLabel>
                    <Select
                      value={filters.status}
                      onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
                      label="Status"
                    >
                      <MenuItem value="all">All</MenuItem>
                      <MenuItem value="OPEN">Open</MenuItem>
                      <MenuItem value="CLOSED">Closed</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>
            </Collapse>
          </CardContent>
        </Card>

        {/* Trade History Table */}
        <Card>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>
                    <TableSortLabel
                      active={filters.sortBy === 'date'}
                      direction={filters.sortOrder}
                      onClick={() => setFilters(prev => ({
                        ...prev,
                        sortBy: 'date',
                        sortOrder: prev.sortOrder === 'asc' ? 'desc' : 'asc'
                      }))}
                    >
                      Date/Time
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>
                    <TableSortLabel
                      active={filters.sortBy === 'instrument'}
                      direction={filters.sortOrder}
                      onClick={() => setFilters(prev => ({
                        ...prev,
                        sortBy: 'instrument',
                        sortOrder: prev.sortOrder === 'asc' ? 'desc' : 'asc'
                      }))}
                    >
                      Instrument
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell align="right">Entry Price</TableCell>
                  <TableCell align="right">Exit Price</TableCell>
                  <TableCell align="right">
                    <TableSortLabel
                      active={filters.sortBy === 'profit'}
                      direction={filters.sortOrder}
                      onClick={() => setFilters(prev => ({
                        ...prev,
                        sortBy: 'profit',
                        sortOrder: prev.sortOrder === 'asc' ? 'desc' : 'asc'
                      }))}
                    >
                      P&L
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredTrades.map((trade) => (
                  <TableRow key={trade.order_id}>
                    <TableCell>{new Date(trade.entry_time).toLocaleString()}</TableCell>
                    <TableCell>{trade.instrument}</TableCell>
                    <TableCell>{trade.trade_type}</TableCell>
                    <TableCell align="right">₹{trade.entry_price}</TableCell>
                    <TableCell align="right">
                      {trade.exit_price ? `₹${trade.exit_price}` : '-'}
                    </TableCell>
                    <TableCell 
                      align="right"
                      sx={{ 
                        color: trade.profit_loss > 0 ? 'success.main' : 
                               trade.profit_loss < 0 ? 'error.main' : 'text.primary'
                      }}
                    >
                      {trade.profit_loss ? `₹${trade.profit_loss.toFixed(2)}` : '-'}
                    </TableCell>
                    <TableCell>
                      <Chip 
                        label={trade.status}
                        color={trade.status === 'OPEN' ? 'primary' : 'default'}
                        size="small"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      </Box>
    );
  };

  return (
    <ThemeProvider theme={darkTheme}>
      <Container 
        maxWidth={isDesktop ? "xl" : isTablet ? "lg" : "sm"} 
        sx={{ 
          mt: isMobile ? 2 : 4, 
          mb: isMobile ? 2 : 4,
          px: isMobile ? 1 : 3 
        }}
      >
        <Box sx={{ 
          mb: isMobile ? 2 : 3, 
          display: 'flex', 
          flexDirection: isMobile ? 'column' : 'row',
          gap: isMobile ? 2 : 0,
          justifyContent: 'space-between', 
          alignItems: isMobile ? 'stretch' : 'center' 
        }}>
          <Typography variant="h4">Algo Trading Dashboard</Typography>
          <Box sx={{ 
            display: 'flex', 
            flexDirection: isMobile ? 'column' : 'row',
            gap: 1 
          }}>
            <FormControl fullWidth={isMobile} sx={{ minWidth: 120 }}>
              <InputLabel>Timeframe</InputLabel>
              <Select
                size={isMobile ? "small" : "medium"}
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value)}
                label="Timeframe"
              >
                <MenuItem value="1D">1 Day</MenuItem>
                <MenuItem value="1W">1 Week</MenuItem>
                <MenuItem value="1M">1 Month</MenuItem>
              </Select>
            </FormControl>
            <IconButton onClick={() => setShowSettings(!showSettings)}>
              <Settings />
            </IconButton>
          </Box>
        </Box>

        <Tabs 
          value={selectedTab} 
          onChange={(e, v) => setSelectedTab(v)} 
          sx={{ mb: 3 }}
          variant={isMobile ? "scrollable" : "standard"}
          scrollButtons={isMobile ? "auto" : false}
        >
          <Tab icon={<ShowChart />} label={isMobile ? "" : "Trading"} />
          <Tab icon={<Assessment />} label={isMobile ? "" : "Analytics"} />
          <Tab icon={<HistoryIcon />} label={isMobile ? "" : "History"} />
        </Tabs>

        {selectedTab === 0 && (
          <Grid container spacing={isMobile ? 2 : 3}>
            <Grid item xs={12}>
              <StyledPaper>
                <Typography variant="h6" gutterBottom>
                  Connection Status: {connectionStatus}
                </Typography>
                {error && (
                  <Typography color="error">
                    Error: {error}
                  </Typography>
                )}
              </StyledPaper>
            </Grid>

            <Grid item xs={12} md={6}>
              <StyledPaper>
                <Typography variant="h6" gutterBottom>
                  Market Data
                </Typography>
                {marketData ? (
                  <Box>
                    <Typography 
                      variant={isMobile ? "h5" : "h4"} 
                      sx={{ mb: isMobile ? 1 : 2 }}
                    >
                      ₹{marketData.data.ltp.toFixed(2)}
                    </Typography>
                    <Typography 
                      color={marketData.data.change >= 0 ? 'success.main' : 'error.main'}
                      variant={isMobile ? "h6" : "h5"}
                    >
                      {marketData.data.change >= 0 ? '+' : ''}
                      {marketData.data.change.toFixed(2)}
                    </Typography>
                    <Typography variant="caption" display="block">
                      Last Updated: {new Date(marketData.data.timestamp).toLocaleTimeString()}
                    </Typography>
                  </Box>
                ) : (
                  <Typography>
                    Waiting for market data...
                  </Typography>
                )}
              </StyledPaper>
            </Grid>

            <Grid item xs={12} md={6}>
              <StyledPaper>
                <Typography variant="h6" gutterBottom>
                  Price History
                </Typography>
                <Box sx={{ 
                  height: isMobile ? 200 : 300, 
                  position: 'relative' 
                }}>
                  {priceHistory.some(point => isValidPrice(point.price)) ? (
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'flex-end', 
                      height: '100%',
                      gap: '2px',
                      position: 'relative',
                      padding: '20px 40px 20px 0'
                    }}>
                      <div style={{ 
                        position: 'absolute', 
                        right: 0, 
                        top: 0, 
                        bottom: 0, 
                        width: '60px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        paddingLeft: '10px',
                        borderLeft: '1px solid rgba(255,255,255,0.1)'
                      }}>
                        <Typography variant="caption">
                          {formatPrice(Math.max(...priceHistory.filter(p => isValidPrice(p.price)).map(p => p.price)))}
                        </Typography>
                        <Typography variant="caption">
                          {formatPrice(Math.min(...priceHistory.filter(p => isValidPrice(p.price)).map(p => p.price)))}
                        </Typography>
                      </div>

                      {priceHistory
                        .filter(point => isValidPrice(point.price))
                        .map((point, index) => {
                          const validPrices = priceHistory
                            .filter(p => isValidPrice(p.price))
                            .map(p => p.price);
                          
                          const minPrice = Math.min(...validPrices);
                          const maxPrice = Math.max(...validPrices);
                          const priceRange = maxPrice - minPrice;
                          
                          const height = priceRange > 0 ? 
                            ((point.price - minPrice) / priceRange) * 100 : 
                            50;

                          return (
                            <div
                              key={index}
                              style={{
                                height: `${height}%`,
                                width: `${100 / validPrices.length}%`,
                                backgroundColor: point.change >= 0 ? '#4caf50' : '#f44336',
                                minWidth: '3px',
                                maxWidth: '10px',
                                position: 'relative',
                                transition: 'height 0.3s ease',
                                marginRight: '1px'
                              }}
                              title={`₹${formatPrice(point.price)} at ${point.time}\nChange: ${point.change.toFixed(2)}`}
                            />
                          );
                        })}
                    </div>
                  ) : (
                    <Box sx={{ 
                      height: '100%', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center' 
                    }}>
                      <Typography variant="body1" color="text.secondary">
                        Waiting for price data...
                      </Typography>
                    </Box>
                  )}
                </Box>
              </StyledPaper>
            </Grid>

            <Grid item xs={12} md={6}>
              <StyledPaper>
                <Typography variant="h6" gutterBottom>
                  Trading Settings
                </Typography>
                <Grid container spacing={isMobile ? 1 : 2}>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      size={isMobile ? "small" : "medium"}
                      label="Call Entry %"
                      type="number"
                      value={settings.callEntryPercent}
                      onChange={handleSettingChange('callEntryPercent')}
                      inputProps={{ step: 0.1 }}
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      size={isMobile ? "small" : "medium"}
                      label="Put Entry %"
                      type="number"
                      value={settings.putEntryPercent}
                      onChange={handleSettingChange('putEntryPercent')}
                      inputProps={{ step: 0.1 }}
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      size={isMobile ? "small" : "medium"}
                      label="Call Stop Loss %"
                      type="number"
                      value={settings.callStopLossPercent}
                      onChange={handleSettingChange('callStopLossPercent')}
                      inputProps={{ step: 0.1 }}
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      size={isMobile ? "small" : "medium"}
                      label="Put Stop Loss %"
                      type="number"
                      value={settings.putStopLossPercent}
                      onChange={handleSettingChange('putStopLossPercent')}
                      inputProps={{ step: 0.1 }}
                      fullWidth
                    />
                  </Grid>
                </Grid>
              </StyledPaper>
            </Grid>

            <Grid item xs={12}>
              <StyledPaper>
                <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
                  <Button
                    variant="contained"
                    color="success"
                    disabled={isTrading}
                    onClick={handleStartTrading}
                    sx={{ width: 120 }}
                  >
                    Start
                  </Button>
                  <Button
                    variant="contained"
                    color="error"
                    disabled={!isTrading}
                    onClick={handleStopTrading}
                    sx={{ width: 120 }}
                  >
                    Stop
                  </Button>
                </Box>
              </StyledPaper>
            </Grid>

            <Grid item xs={12}>
              <StyledPaper>
                <Typography variant="h6" gutterBottom>
                  Open Positions
                </Typography>
                <Grid container spacing={2}>
                  {positions.map((position, index) => (
                    <Grid item xs={12} sm={6} md={4} key={index}>
                      <Paper sx={{ p: 2 }}>
                        <Typography>
                          {position.instrumentToken}
                        </Typography>
                        <Typography>
                          Entry: ₹{position.entryPrice}
                        </Typography>
                        <Typography>
                          Stop Loss: ₹{position.stopLoss}
                        </Typography>
                      </Paper>
                    </Grid>
                  ))}
                </Grid>
              </StyledPaper>
            </Grid>

            <Grid item xs={12}>
              <StyledPaper>
                <Box sx={{ 
                  display: 'flex', 
                  flexDirection: isMobile ? 'column' : 'row',
                  gap: isMobile ? 2 : 0,
                  justifyContent: 'space-between', 
                  mb: 2 
                }}>
                  <Typography variant="h6">Trade History</Typography>
                  <Box>
                    <Typography variant="body1" color="success.main" sx={{ textAlign: 'right' }}>
                      Today's P&L: ₹{pnl.dailyPnL?.toFixed(2) || '0.00'}
                    </Typography>
                    <Typography variant="body1" color="success.main" sx={{ textAlign: 'right' }}>
                      Total Profit: ₹{pnl.totalProfit?.toFixed(2) || '0.00'}
                    </Typography>
                    <Typography variant="body1" color="error.main" sx={{ textAlign: 'right' }}>
                      Total Loss: ₹{pnl.totalLoss?.toFixed(2) || '0.00'}
                    </Typography>
                    <Typography 
                      variant="body1" 
                      color={pnl.netPnL >= 0 ? 'success.main' : 'error.main'} 
                      sx={{ 
                        textAlign: 'right',
                        fontWeight: 'bold',
                        borderTop: '1px solid rgba(255,255,255,0.1)',
                        mt: 1,
                        pt: 1
                      }}
                    >
                      Net P&L: ₹{pnl.netPnL?.toFixed(2) || '0.00'}
                    </Typography>
                  </Box>
                </Box>
                <Box sx={{ 
                  overflowX: 'auto',
                  '.MuiTable-root': {
                    minWidth: isMobile ? 600 : 'auto'
                  }
                }}>
                  <Table size={isMobile ? "small" : "medium"}>
                    <TableHead>
                      <TableRow>
                        <TableCell>Time</TableCell>
                        <TableCell>Type</TableCell>
                        <TableCell>Instrument</TableCell>
                        <TableCell align="right">Entry</TableCell>
                        <TableCell align="right">Exit</TableCell>
                        <TableCell align="right">P&L</TableCell>
                        <TableCell>Status</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {tradeHistory.map((trade) => (
                        <TableRow key={trade.order_id}>
                          <TableCell>{new Date(trade.entry_time).toLocaleString()}</TableCell>
                          <TableCell>{trade.trade_type}</TableCell>
                          <TableCell>{trade.instrument}</TableCell>
                          <TableCell align="right">₹{trade.entry_price}</TableCell>
                          <TableCell align="right">
                            {trade.exit_price ? `₹${trade.exit_price}` : '-'}
                          </TableCell>
                          <TableCell 
                            align="right"
                            sx={{ 
                              color: trade.profit_loss > 0 ? 'success.main' : 
                                     trade.profit_loss < 0 ? 'error.main' : 'text.primary'
                            }}
                          >
                            {trade.profit_loss ? `₹${trade.profit_loss.toFixed(2)}` : '-'}
                          </TableCell>
                          <TableCell>
                            <Chip 
                              label={trade.status}
                              color={trade.status === 'OPEN' ? 'primary' : 'default'}
                              size="small"
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Box>
              </StyledPaper>
            </Grid>

            <Grid item xs={12} md={4}>
              <SystemHealthCard isMobile={isMobile} />
            </Grid>

            <Grid item xs={12} md={4}>
              <TradingStatsCard isMobile={isMobile} />
            </Grid>

            <Grid item xs={12} md={4}>
              <AlertsTimeline isMobile={isMobile} />
            </Grid>
          </Grid>
        )}

        {selectedTab === 1 && (
          <AnalyticsView 
            tradeHistory={tradeHistory} 
            tradingStats={tradingStats}
            isMobile={isMobile}
          />
        )}

        {selectedTab === 2 && (
          <HistoryView 
            tradeHistory={tradeHistory}
            isMobile={isMobile}
          />
        )}

        <Snackbar 
          open={notification.open} 
          autoHideDuration={6000} 
          onClose={handleCloseNotification}
          anchorOrigin={{ 
            vertical: isMobile ? 'bottom' : 'top', 
            horizontal: 'right' 
          }}
        >
          <Alert 
            onClose={handleCloseNotification} 
            severity={notification.type} 
            sx={{ width: '100%' }}
          >
            {notification.message}
          </Alert>
        </Snackbar>
      </Container>
    </ThemeProvider>
  );
}

export default App; 