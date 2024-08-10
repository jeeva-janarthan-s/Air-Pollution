const axios = require('axios');
const { Pool } = require('pg');
const schedule = require('node-schedule');

// Database connection pool
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'postgres',
  password: 'JEEVA179',
  port: 5432, // Default PostgreSQL port
});

// OpenWeatherMap API key and base URLs
const API_KEY = 'fb1047427149dbd8ea6e7eef2217649a';
const WEATHER_BASE_URL = 'http://api.openweathermap.org/data/2.5/weather';
const AIR_QUALITY_BASE_URL = 'http://api.openweathermap.org/data/2.5/air_pollution';
const UV_INDEX_BASE_URL = 'http://api.openweathermap.org/data/2.5/uvi';
const FORECAST_BASE_URL = 'https://api.openweathermap.org/data/2.5/forecast';

let apiCallCount = 0;
const MAX_CALLS_PER_MINUTE = 60;

// Function to pause execution for a specified number of milliseconds
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Function to insert data into the respective state district table
async function insertDistrictData(state, districtId, districtName, temperature, humidity, windSpeed, airQualityIndex, pm25, pm10, no2, co, so2, o3, precipitation, uvIndex, seaLevelPressure) {
  try {
    const query = `
      INSERT INTO ${state} (district_id, district_name, temperature, humidity, wind_speed, air_quality_index, pm25, pm10, no2, co, so2, o3, precipitation, uv_index, sea_level_pressure)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *;
    `;
    const values = [districtId, districtName, temperature, humidity, windSpeed, airQualityIndex, pm25, pm10, no2, co, so2, o3, precipitation, uvIndex, seaLevelPressure];
    const res = await pool.query(query, values);
    console.log(`${state} District Data inserted:`, res.rows[0]);
  } catch (err) {
    console.error(`Error inserting district data for ${state}:`, err);
  }
}

// Function to fetch weather data using latitude and longitude
async function fetchWeatherData(lat, lon) {
  try {
    await checkRateLimit();

    const response = await axios.get(WEATHER_BASE_URL, {
      params: {
        lat: lat,
        lon: lon,
        units: 'metric',
        appid: API_KEY,
      },
    });

    return response.data;
  } catch (error) {
    console.error('Error fetching weather data:', error);
    return null;
  }
}

// Function to fetch air quality data
async function fetchAirQualityData(lat, lon) {
  try {
    await checkRateLimit();

    const response = await axios.get(AIR_QUALITY_BASE_URL, {
      params: {
        lat: lat,
        lon: lon,
        appid: API_KEY
      }
    });

    const data = response.data;
    return {
      airQualityIndex: data.list[0].main.aqi, // Air quality index
      pm25: data.list[0].components.pm2_5,    // PM2.5
      pm10: data.list[0].components.pm10,     // PM10
      no2: data.list[0].components.no2,       // NO2
      co: data.list[0].components.co,         // CO
      so2: data.list[0].components.so2,       // SO2
      o3: data.list[0].components.o3          // O3
    };
  } catch (error) {
    console.error('Error fetching air quality data:', error);
    return {};
  }
}

// Function to fetch UV index data
async function fetchUVIndex(lat, lon) {
  try {
    await checkRateLimit();

    const response = await axios.get(UV_INDEX_BASE_URL, {
      params: {
        lat: lat,
        lon: lon,
        appid: API_KEY
      }
    });

    return response.data.value; // UV Index value
  } catch (error) {
    console.error('Error fetching UV index data:', error);
    return null;
  }
}

// Function to fetch forecast precipitation data
async function fetchForecastPrecipitationData(lat, lon) {
  try {
    await checkRateLimit();

    const response = await axios.get(FORECAST_BASE_URL, {
      params: {
        lat: lat,
        lon: lon,
        appid: API_KEY,
        units: 'metric'
      }
    });

    const forecastData = response.data;
    let totalPrecipitation = 0;

    forecastData.list.forEach((forecast) => {
      totalPrecipitation += forecast.rain ? forecast.rain['3h'] || 0 : 0;
    });

    return totalPrecipitation;
  } catch (error) {
    console.error('Error fetching forecast precipitation data:', error);
    return 0;
  }
}

// Function to check and manage API rate limit
async function checkRateLimit() {
  apiCallCount++;
  if (apiCallCount >= MAX_CALLS_PER_MINUTE) {
    const secondsUntilNextMinute = 60 - new Date().getSeconds();
    console.log(`Rate limit reached. Waiting for ${secondsUntilNextMinute} seconds...`);
    await sleep(secondsUntilNextMinute * 1000);
    apiCallCount = 0; // Reset count after waiting
  }
}

// Function to fetch and insert data for all districts in a state
async function fetchAndInsertDataForState(state, districts) {
  for (const district of districts) {
    const weatherData = await fetchWeatherData(district.lat, district.lon);
    const airQualityData = await fetchAirQualityData(district.lat, district.lon);
    const uvIndex = await fetchUVIndex(district.lat, district.lon);
    const precipitation = await fetchForecastPrecipitationData(district.lat, district.lon);

    if (weatherData) {
      // Access sea level pressure or fallback to regular pressure
      const seaLevelPressure = weatherData.main.sea_level || weatherData.main.pressure;

      await insertDistrictData(
        state,
        district.id,
        district.name,
        weatherData.main.temp,
        weatherData.main.humidity,
        weatherData.wind.speed,
        airQualityData.airQualityIndex || null,
        airQualityData.pm25 || null,
        airQualityData.pm10 || null,
        airQualityData.no2 || null,
        airQualityData.co || null,
        airQualityData.so2 || null,
        airQualityData.o3 || null,
        precipitation,
        uvIndex || null,
        seaLevelPressure || null
      );
    }
  }
}

// List of districts for each state (example format)
// Add your actual district data for each state
const states = {
    andhra_pradesh : [
        { "id": 1264527, "name": "Anantapur", "lat": 14.6819, "lon": 77.6006 },
        { "id": 1264528, "name": "Chittoor", "lat": 13.2172, "lon": 79.1003 },
        { "id": 1264529, "name": "East Godavari", "lat": 17.1560, "lon": 82.2462 },
        { "id": 1264530, "name": "Guntur", "lat": 16.3067, "lon": 80.4365 },
        { "id": 1264531, "name": "Krishna", "lat": 16.5730, "lon": 81.5032 },
        { "id": 1264532, "name": "Kurnool", "lat": 15.8281, "lon": 78.0373 },
        { "id": 1264533, "name": "Prakasam", "lat": 15.3639, "lon": 79.7400 },
        { "id": 1264534, "name": "Srikakulam", "lat": 18.2969, "lon": 83.8975 },
        { "id": 1264535, "name": "Visakhapatnam", "lat": 17.6868, "lon": 83.2185 },
        { "id": 1264536, "name": "Vizianagaram", "lat": 18.1067, "lon": 83.3956 },
        { "id": 1264537, "name": "West Godavari", "lat": 16.9012, "lon": 81.2892 },
        { "id": 1264538, "name": "Kadapa", "lat": 14.4673, "lon": 78.8242 },
        { "id": 1264539, "name": "SPS Nellore", "lat": 14.4426, "lon": 79.9865 },
        { "id": 1264540, "name": "Kakinada", "lat": 16.9891, "lon": 82.2475 },
        { "id": 1264541, "name": "Nandyal", "lat": 15.4786, "lon": 78.4831 },
        { "id": 1264542, "name": "Sri Potti Sriramulu Nellore", "lat": 14.4551, "lon": 79.9878 },
        { "id": 1264543, "name": "Tirupati", "lat": 13.6288, "lon": 79.4192 },
        { "id": 1264544, "name": "Amaravati", "lat": 16.5419, "lon": 80.5164 },
        { "id": 1264545, "name": "Machilipatnam", "lat": 16.1875, "lon": 81.1389 },
        { "id": 1264546, "name": "Peddapuram", "lat": 17.0849, "lon": 82.1403 },
        { "id": 1264547, "name": "Narsapur", "lat": 16.4330, "lon": 81.7006 },
        { "id": 1264548, "name": "Rajamahendravaram", "lat": 17.0052, "lon": 81.7778 },
        { "id": 1264549, "name": "Ongole", "lat": 15.5057, "lon": 80.0499 },
        { "id": 1264550, "name": "Gudur", "lat": 14.1508, "lon": 79.8514 },
        { "id": 1264551, "name": "Tadepalligudem", "lat": 16.8147, "lon": 81.5260 },
        { "id": 1264552, "name": "Chilakaluripet", "lat": 16.0891, "lon": 80.1679 }
    ],
    'arunachal_pradesh': [
      { "id": 1252625, "name": "Tawang", "lat": 27.5530, "lon": 91.5462 },
      { "id": 1252626, "name": "West Kameng", "lat": 27.1464, "lon": 92.0982 },
      { "id": 1252627, "name": "East Kameng", "lat": 26.8553, "lon": 92.1824 },
      { "id": 1252628, "name": "Papum Pare", "lat": 26.9576, "lon": 92.7527 },
      { "id": 1252629, "name": "Kra Daadi", "lat": 27.0920, "lon": 93.1188 },
      { "id": 1252630, "name": "Kurung Kumey", "lat": 27.3942, "lon": 93.1555 },
      { "id": 1252631, "name": "Lower Subansiri", "lat": 27.0920, "lon": 93.6110 },
      { "id": 1252632, "name": "Upper Subansiri", "lat": 28.0890, "lon": 94.0578 },
      { "id": 1252633, "name": "West Siang", "lat": 29.0551, "lon": 94.3186 },
      { "id": 1252634, "name": "East Siang", "lat": 28.2915, "lon": 95.5735 },
      { "id": 1252635, "name": "Siang", "lat": 28.1488, "lon": 95.2905 },
      { "id": 1252636, "name": "Upper Siang", "lat": 28.4708, "lon": 95.6435 },
      { "id": 1252637, "name": "Lower Dibang Valley", "lat": 27.5565, "lon": 95.5041 },
      { "id": 1252638, "name": "Upper Dibang Valley", "lat": 28.0746, "lon": 95.8846 },
      { "id": 1252639, "name": "Dibang Valley", "lat": 28.1335, "lon": 95.4705 },
      { "id": 1252640, "name": "Anjaw", "lat": 27.8622, "lon": 96.1563 },
      { "id": 1252641, "name": "Lohit", "lat": 27.7601, "lon": 96.1075 },
      { "id": 1252642, "name": "Changlang", "lat": 27.1095, "lon": 95.6528 },
      { "id": 1252643, "name": "Namsai", "lat": 27.0125, "lon": 95.5983 },
      { "id": 1252644, "name": "Tezu", "lat": 27.9288, "lon": 95.2237 },
      { "id": 1252645, "name": "Itanagar", "lat": 27.0836, "lon": 93.6167 },
      { "id": 1252646, "name": "Lepa Rada", "lat": 27.1515, "lon": 92.9436 },
      { "id": 1252647, "name": "Tirap", "lat": 27.0912, "lon": 95.2973 },
      { "id": 1252648, "name": "Longding", "lat": 27.3085, "lon": 95.3700 },
      { "id": 1252649, "name": "Kamle", "lat": 27.2096, "lon": 93.4218 },
      { "id": 1252650, "name": "Pakke Kessang", "lat": 27.0450, "lon": 92.9530 },
      { "id": 1252651, "name": "Kolasib", "lat": 27.3732, "lon": 92.4734 },
      { "id": 1252652, "name": "Maksam", "lat": 27.4723, "lon": 93.2654 },
      { "id": 1252653, "name": "Nirjuli", "lat": 27.1517, "lon": 93.6153 },
      { "id": 1252654, "name": "Rupa", "lat": 27.0941, "lon": 92.2281 },
      { "id": 1252655, "name": "Kardang", "lat": 32.5981, "lon": 77.1638 },
      { "id": 1252656, "name": "Pangin", "lat": 28.2080, "lon": 95.3325 },
      { "id": 1252657, "name": "Daporijo", "lat": 27.1048, "lon": 93.6980 }
    ],
    'assam': [
      { "id": 1257436, "name": "Baksa", "lat": 26.3650, "lon": 91.2410 },
      { "id": 1257437, "name": "Barpeta", "lat": 26.2811, "lon": 91.0955 },
      { "id": 1257438, "name": "Bongaigaon", "lat": 26.4866, "lon": 90.5788 },
      { "id": 1257439, "name": "Cachar", "lat": 24.8014, "lon": 92.4382 },
      { "id": 1257440, "name": "Charaideo", "lat": 26.9810, "lon": 94.0285 },
      { "id": 1257441, "name": "Chirang", "lat": 26.3487, "lon": 90.5804 },
      { "id": 1257442, "name": "Darrang", "lat": 26.3701, "lon": 92.1943 },
      { "id": 1257443, "name": "Dhemaji", "lat": 27.3216, "lon": 94.1160 },
      { "id": 1257444, "name": "Dhubri", "lat": 26.0270, "lon": 89.9705 },
      { "id": 1257445, "name": "Dibrugarh", "lat": 27.4858, "lon": 94.9041 },
      { "id": 1257446, "name": "Diphu", "lat": 25.8551, "lon": 92.3861 },
      { "id": 1257447, "name": "Goalpara", "lat": 26.1844, "lon": 90.6026 },
      { "id": 1257448, "name": "Golaghat", "lat": 26.4744, "lon": 93.9570 },
      { "id": 1257449, "name": "Hailakandi", "lat": 24.6885, "lon": 92.5885 },
      { "id": 1257450, "name": "Hojai", "lat": 26.2215, "lon": 92.6810 },
      { "id": 1257451, "name": "Karbi Anglong", "lat": 25.4858, "lon": 92.7883 },
      { "id": 1257452, "name": "Karimganj", "lat": 24.6887, "lon": 92.5827 },
      { "id": 1257453, "name": "Kokrajhar", "lat": 26.3584, "lon": 90.4117 },
      { "id": 1257454, "name": "Lakhimpur", "lat": 27.2338, "lon": 93.7846 },
      { "id": 1257455, "name": "Majuli", "lat": 26.9404, "lon": 93.1878 },
      { "id": 1257456, "name": "Morigaon", "lat": 26.3051, "lon": 92.4894 },
      { "id": 1257457, "name": "Nagaon", "lat": 26.3192, "lon": 92.6460 },
      { "id": 1257458, "name": "Nalbari", "lat": 26.0723, "lon": 91.6188 },
      { "id": 1257459, "name": "Sivasagar", "lat": 26.9927, "lon": 94.6161 },
      { "id": 1257460, "name": "Sonitpur", "lat": 26.6200, "lon": 92.8280 },
      { "id": 1257461, "name": "Tinsukia", "lat": 27.4890, "lon": 95.3410 },
      { "id": 1257462, "name": "Udalguri", "lat": 26.3500, "lon": 92.5000 },
      { "id": 1257463, "name": "West Karbi Anglong", "lat": 25.5107, "lon": 92.9500 }
    ],
    'bihar': [
      { "id": 1254297, "name": "Araria", "lat": 26.1664, "lon": 87.5316 },
      { "id": 1254298, "name": "Arwal", "lat": 24.7255, "lon": 84.6687 },
      { "id": 1254299, "name": "Aurangabad", "lat": 24.7450, "lon": 84.3630 },
      { "id": 1254300, "name": "Banka", "lat": 24.8588, "lon": 86.9483 },
      { "id": 1254301, "name": "Barauni", "lat": 25.4631, "lon": 86.0728 },
      { "id": 1254302, "name": "Begusarai", "lat": 25.4118, "lon": 86.1321 },
      { "id": 1254303, "name": "Bhagalpur", "lat": 25.2500, "lon": 87.0000 },
      { "id": 1254304, "name": "Bhojpur", "lat": 25.4300, "lon": 84.5100 },
      { "id": 1254305, "name": "Buxar", "lat": 25.5640, "lon": 84.1210 },
      { "id": 1254306, "name": "Darbhanga", "lat": 26.1500, "lon": 85.9000 },
      { "id": 1254307, "name": "East Champaran", "lat": 26.6500, "lon": 84.9000 },
      { "id": 1254308, "name": "Gaya", "lat": 24.7833, "lon": 85.0000 },
      { "id": 1254309, "name": "Jehanabad", "lat": 25.2000, "lon": 85.7000 },
      { "id": 1254310, "name": "Kaimur", "lat": 25.0300, "lon": 83.6500 },
      { "id": 1254311, "name": "Katihar", "lat": 25.5300, "lon": 87.5800 },
      { "id": 1254312, "name": "Kishanganj", "lat": 26.0833, "lon": 87.9833 },
      { "id": 1254313, "name": "Lakhisarai", "lat": 25.2000, "lon": 86.0000 },
      { "id": 1254314, "name": "Madhepura", "lat": 25.9000, "lon": 86.8000 },
      { "id": 1254315, "name": "Madhubani", "lat": 26.3667, "lon": 86.0833 },
      { "id": 1254316, "name": "Munger", "lat": 25.3728, "lon": 86.4583 },
      { "id": 1254317, "name": "Muzaffarpur", "lat": 26.1200, "lon": 85.3900 },
      { "id": 1254318, "name": "Nalanda", "lat": 25.1000, "lon": 85.5000 },
      { "id": 1254319, "name": "Nawada", "lat": 24.8833, "lon": 85.4000 },
      { "id": 1254320, "name": "Patna", "lat": 25.6000, "lon": 85.1167 },
      { "id": 1254321, "name": "Purnia", "lat": 25.7800, "lon": 87.4700 },
      { "id": 1254322, "name": "Rohtas", "lat": 24.7500, "lon": 84.0000 },
      { "id": 1254323, "name": "Saharsa", "lat": 25.8833, "lon": 86.6167 },
      { "id": 1254324, "name": "Samastipur", "lat": 25.8833, "lon": 85.7833 },
      { "id": 1254325, "name": "Saran", "lat": 25.6864, "lon": 84.7700 },
      { "id": 1254326, "name": "Sheikhpura", "lat": 25.2000, "lon": 85.7667 },
      { "id": 1254327, "name": "Sheohar", "lat": 26.1167, "lon": 85.7833 },
      { "id": 1254328, "name": "Sitamarhi", "lat": 26.5833, "lon": 85.5833 },
      { "id": 1254329, "name": "Supaul", "lat": 26.0667, "lon": 86.5667 },
      { "id": 1254330, "name": "Vaishali", "lat": 25.6833, "lon": 85.2333 },
      { "id": 1254331, "name": "West Champaran", "lat": 27.0833, "lon": 84.5833 }
    ],
    'chhattisgarh': [
      { "id": 1254918, "name": "Balod", "lat": 20.7345, "lon": 81.2838 },
      { "id": 1254919, "name": "Baloda Bazar", "lat": 21.2818, "lon": 82.0307 },
      { "id": 1254920, "name": "Balrampur", "lat": 22.6900, "lon": 82.2667 },
      { "id": 1254921, "name": "Bastar", "lat": 19.0704, "lon": 81.6601 },
      { "id": 1254922, "name": "Bilaspur", "lat": 22.0903, "lon": 82.1515 },
      { "id": 1254923, "name": "Dantewada", "lat": 19.1245, "lon": 81.7650 },
      { "id": 1254924, "name": "Dhamtari", "lat": 20.7100, "lon": 81.6000 },
      { "id": 1254925, "name": "Durg", "lat": 21.2000, "lon": 81.2833 },
      { "id": 1254926, "name": "Gariaband", "lat": 20.6800, "lon": 82.1000 },
      { "id": 1254927, "name": "Janjgir-Champa", "lat": 22.0300, "lon": 82.5400 },
      { "id": 1254928, "name": "Jashpur", "lat": 22.7833, "lon": 83.1667 },
      { "id": 1254929, "name": "Kabirdham", "lat": 22.0000, "lon": 81.5000 },
      { "id": 1254930, "name": "Kanker", "lat": 20.4294, "lon": 81.5969 },
      { "id": 1254931, "name": "Kondagaon", "lat": 20.8167, "lon": 81.5333 },
      { "id": 1254932, "name": "Korba", "lat": 22.3500, "lon": 82.6500 },
      { "id": 1254933, "name": "Korea", "lat": 23.1111, "lon": 82.5486 },
      { "id": 1254934, "name": "Mungeli", "lat": 22.0500, "lon": 81.2000 },
      { "id": 1254935, "name": "Narayanpur", "lat": 20.7167, "lon": 81.6167 },
      { "id": 1254936, "name": "Raigarh", "lat": 21.9000, "lon": 83.0000 },
      { "id": 1254937, "name": "Raipur", "lat": 21.2500, "lon": 81.6333 },
      { "id": 1254938, "name": "Rajnandgaon", "lat": 21.0667, "lon": 81.0333 },
      { "id": 1254939, "name": "Sarguja", "lat": 23.1167, "lon": 83.1667 },
      { "id": 1254940, "name": "Surajpur", "lat": 23.1333, "lon": 82.8333 },
      { "id": 1254941, "name": "Surguja", "lat": 23.1667, "lon": 82.5833 },
      { "id": 1254942, "name": "Bilaspur", "lat": 22.0000, "lon": 82.0000 },
      { "id": 1254943, "name": "Raigarh", "lat": 22.0000, "lon": 83.0000 },
      { "id": 1254944, "name": "Durg", "lat": 21.0000, "lon": 81.0000 }
    ],
    'goa': [
      { "id": 1264522, "name": "North Goa", "lat": 15.5522, "lon": 73.8475 },
      { "id": 1264523, "name": "South Goa", "lat": 15.2034, "lon": 74.0161 }
    ],
    'gujarat': [
      { "id": 1264524, "name": "Ahmedabad", "lat": 23.0225, "lon": 72.5714 },
      { "id": 1264525, "name": "Amreli", "lat": 21.5960, "lon": 84.1780 },
      { "id": 1264526, "name": "Anand", "lat": 22.5577, "lon": 72.9710 },
      { "id": 1264527, "name": "Aravalli", "lat": 23.4266, "lon": 73.1986 },
      { "id": 1264528, "name": "Banaskantha", "lat": 24.2800, "lon": 72.4290 },
      { "id": 1264529, "name": "Bharuch", "lat": 21.7067, "lon": 72.9933 },
      { "id": 1264530, "name": "Bhavnagar", "lat": 21.7600, "lon": 72.1500 },
      { "id": 1264531, "name": "Botad", "lat": 22.1500, "lon": 71.6667 },
      { "id": 1264532, "name": "Chhota Udepur", "lat": 22.3821, "lon": 73.5384 },
      { "id": 1264533, "name": "Dahod", "lat": 22.8497, "lon": 74.0235 },
      { "id": 1264534, "name": "Dang", "lat": 20.6340, "lon": 73.2385 },
      { "id": 1264535, "name": "Devbhoomi Dwarka", "lat": 22.3792, "lon": 68.9587 },
      { "id": 1264536, "name": "Gandhinagar", "lat": 23.2156, "lon": 72.6369 },
      { "id": 1264537, "name": "Gir Somnath", "lat": 20.9171, "lon": 70.6658 },
      { "id": 1264538, "name": "Jamnagar", "lat": 22.4700, "lon": 70.0667 },
      { "id": 1264539, "name": "Junagadh", "lat": 21.5216, "lon": 70.4577 },
      { "id": 1264540, "name": "Kutch", "lat": 23.3842, "lon": 69.6918 },
      { "id": 1264541, "name": "Kheda", "lat": 22.7822, "lon": 72.8828 },
      { "id": 1264542, "name": "Mahisagar", "lat": 22.6064, "lon": 73.6800 },
      { "id": 1264543, "name": "Mehsana", "lat": 23.5988, "lon": 72.3986 },
      { "id": 1264544, "name": "Morbi", "lat": 22.7750, "lon": 70.8967 },
      { "id": 1264545, "name": "Narmada", "lat": 21.7432, "lon": 73.2532 },
      { "id": 1264546, "name": "Navsari", "lat": 20.9473, "lon": 72.9238 },
      { "id": 1264547, "name": "Panchmahal", "lat": 22.3982, "lon": 73.7552 },
      { "id": 1264548, "name": "Patan", "lat": 24.1333, "lon": 72.1185 },
      { "id": 1264549, "name": "Porbandar", "lat": 21.6414, "lon": 69.6696 },
      { "id": 1264550, "name": "Rajkot", "lat": 22.3039, "lon": 70.8022 },
      { "id": 1264551, "name": "Sabarkantha", "lat": 23.2038, "lon": 73.4638 },
      { "id": 1264552, "name": "Surat", "lat": 21.1702, "lon": 72.8311 },
      { "id": 1264553, "name": "Surendranagar", "lat": 22.7370, "lon": 71.6130 },
      { "id": 1264554, "name": "Tapi", "lat": 21.2051, "lon": 73.6763 },
      { "id": 1264555, "name": "Vadodara", "lat": 22.3070, "lon": 73.1812 },
      { "id": 1264556, "name": "Valsad", "lat": 20.6418, "lon": 72.9208 },
      { "id": 1264557, "name": "Vapi", "lat": 20.3676, "lon": 72.9056 }
    ],
    'haryana': [
      { "id": 1264523, "name": "Ambala", "lat": 30.3794, "lon": 76.7800 },
      { "id": 1264524, "name": "Bhiwani", "lat": 28.7712, "lon": 76.5884 },
      { "id": 1264525, "name": "Charkhi Dadri", "lat": 28.6062, "lon": 76.8251 },
      { "id": 1264526, "name": "Faridabad", "lat": 28.4082, "lon": 77.3178 },
      { "id": 1264527, "name": "Fatehabad", "lat": 29.5284, "lon": 75.4530 },
      { "id": 1264528, "name": "Gurugram", "lat": 28.4595, "lon": 77.0266 },
      { "id": 1264529, "name": "Hisar", "lat": 29.1496, "lon": 75.7210 },
      { "id": 1264530, "name": "Jhajjar", "lat": 28.6173, "lon": 76.6218 },
      { "id": 1264531, "name": "Jind", "lat": 29.3181, "lon": 76.5698 },
      { "id": 1264532, "name": "Kaithal", "lat": 29.8343, "lon": 76.4148 },
      { "id": 1264533, "name": "Karnal", "lat": 29.6857, "lon": 76.9909 },
      { "id": 1264534, "name": "Mahendragarh", "lat": 28.2205, "lon": 76.1406 },
      { "id": 1264535, "name": "Mewat", "lat": 28.2350, "lon": 77.0162 },
      { "id": 1264536, "name": "Palwal", "lat": 28.1502, "lon": 77.3200 },
      { "id": 1264537, "name": "Panchkula", "lat": 30.6944, "lon": 76.8559 },
      { "id": 1264538, "name": "Panipat", "lat": 29.3911, "lon": 76.9635 },
      { "id": 1264539, "name": "Rewari", "lat": 28.2131, "lon": 76.6102 },
      { "id": 1264540, "name": "Rohtak", "lat": 28.8951, "lon": 76.6068 },
      { "id": 1264541, "name": "Sirsa", "lat": 29.5292, "lon": 75.0255 },
      { "id": 1264542, "name": "Sonipat", "lat": 28.9916, "lon": 77.0998 },
      { "id": 1264543, "name": "Yamunanagar", "lat": 30.1436, "lon": 77.2810 }
    ],
    'himachal_pradesh': [
      { "id": 1253608, "name": "Bilaspur", "lat": 31.3875, "lon": 76.7638 },
      { "id": 1253609, "name": "Chamba", "lat": 32.5535, "lon": 76.1334 },
      { "id": 1253610, "name": "Hamirpur", "lat": 31.6547, "lon": 76.5181 },
      { "id": 1253611, "name": "Kangra", "lat": 32.0974, "lon": 76.2736 },
      { "id": 1253612, "name": "Kinnaur", "lat": 31.7831, "lon": 78.1702 },
      { "id": 1253613, "name": "Kullu", "lat": 31.9676, "lon": 77.0890 },
      { "id": 1253614, "name": "Lahaul and Spiti", "lat": 32.3320, "lon": 77.6450 },
      { "id": 1253615, "name": "Mandi", "lat": 31.7108, "lon": 76.9341 },
      { "id": 1253616, "name": "Shimla", "lat": 31.1048, "lon": 77.1734 },
      { "id": 1253617, "name": "Sirmaur", "lat": 30.5485, "lon": 77.3134 },
      { "id": 1253618, "name": "Solan", "lat": 30.9121, "lon": 77.0770 },
      { "id": 1253619, "name": "Una", "lat": 31.4313, "lon": 76.2311 }
    ],
    'jharkhand': [
      { "id": 1264526, "name": "Bokaro", "lat": 23.7907, "lon": 85.9935 },
      { "id": 1264527, "name": "Chatra", "lat": 24.2737, "lon": 84.7330 },
      { "id": 1264528, "name": "Deoghar", "lat": 24.4794, "lon": 86.6960 },
      { "id": 1264529, "name": "Dhanbad", "lat": 23.7967, "lon": 86.4330 },
      { "id": 1264530, "name": "Dumka", "lat": 24.2661, "lon": 87.2460 },
      { "id": 1264531, "name": "East Singhbhum", "lat": 22.8057, "lon": 86.2384 },
      { "id": 1264532, "name": "Garhwa", "lat": 24.0426, "lon": 83.2830 },
      { "id": 1264533, "name": "Giridih", "lat": 24.1948, "lon": 86.2878 },
      { "id": 1264534, "name": "Jamtara", "lat": 24.1661, "lon": 86.6000 },
      { "id": 1264535, "name": "Khunti", "lat": 23.0820, "lon": 85.3217 },
      { "id": 1264536, "name": "Koderma", "lat": 24.4345, "lon": 85.5942 },
      { "id": 1264537, "name": "Latehar", "lat": 23.7317, "lon": 84.2834 },
      { "id": 1264538, "name": "Lohardaga", "lat": 23.4312, "lon": 84.6572 },
      { "id": 1264539, "name": "Pakur", "lat": 24.6325, "lon": 87.7340 },
      { "id": 1264540, "name": "Palamu", "lat": 24.0921, "lon": 84.1884 },
      { "id": 1264541, "name": "Ranchi", "lat": 23.3441, "lon": 85.3096 },
      { "id": 1264542, "name": "Sahibganj", "lat": 25.2365, "lon": 87.6208 },
      { "id": 1264543, "name": "Seraikela-Kharsawan", "lat": 22.6625, "lon": 85.8464 },
      { "id": 1264544, "name": "West Singhbhum", "lat": 22.7275, "lon": 85.6892 },
      { "id": 1264545, "name": "Hazaribagh", "lat": 23.9890, "lon": 85.5851 },
      { "id": 1264546, "name": "Simdega", "lat": 22.5667, "lon": 84.6167 },
      { "id": 1264547, "name": "Jamtara", "lat": 24.1661, "lon": 86.6000 },
      { "id": 1264548, "name": "Giridih", "lat": 24.1948, "lon": 86.2878 },
      { "id": 1264549, "name": "Koderma", "lat": 24.4345, "lon": 85.5942 },
      { "id": 1264550, "name": "Latehar", "lat": 23.7317, "lon": 84.2834 },
      { "id": 1264551, "name": "Lohardaga", "lat": 23.4312, "lon": 84.6572 },
      { "id": 1264552, "name": "Pakur", "lat": 24.6325, "lon": 87.7340 },
      { "id": 1264553, "name": "Palamu", "lat": 24.0921, "lon": 84.1884 },
      { "id": 1264554, "name": "Ranchi", "lat": 23.3441, "lon": 85.3096 }
    ],
    'karnataka': [
      { "id": 1277333, "name": "Bagalkot", "lat": 16.1804, "lon": 75.2885 },
      { "id": 1277334, "name": "Bangalore Rural", "lat": 12.9333, "lon": 77.5667 },
      { "id": 1277335, "name": "Bangalore Urban", "lat": 12.9716, "lon": 77.5946 },
      { "id": 1277336, "name": "Belagavi", "lat": 15.8497, "lon": 74.5590 },
      { "id": 1277337, "name": "Bellary", "lat": 15.1398, "lon": 76.9146 },
      { "id": 1277338, "name": "Bidar", "lat": 17.9110, "lon": 77.5140 },
      { "id": 1277339, "name": "Chamarajanagar", "lat": 12.1696, "lon": 76.9560 },
      { "id": 1277340, "name": "Chikkaballapura", "lat": 13.3986, "lon": 77.7328 },
      { "id": 1277341, "name": "Chikkamagaluru", "lat": 13.3176, "lon": 75.7669 },
      { "id": 1277342, "name": "Chitradurga", "lat": 14.2315, "lon": 76.9810 },
      { "id": 1277343, "name": "Dakshina Kannada", "lat": 12.8703, "lon": 74.8311 },
      { "id": 1277344, "name": "Davanagere", "lat": 14.4611, "lon": 75.9206 },
      { "id": 1277345, "name": "Dharwad", "lat": 15.4575, "lon": 75.0189 },
      { "id": 1277346, "name": "Gadag", "lat": 15.4083, "lon": 75.6511 },
      { "id": 1277347, "name": "Hassan", "lat": 13.0050, "lon": 76.0973 },
      { "id": 1277348, "name": "Haveri", "lat": 14.7955, "lon": 75.4631 },
      { "id": 1277349, "name": "Kodagu", "lat": 12.3383, "lon": 90.0486 },
      { "id": 1277350, "name": "Kolar", "lat": 13.1370, "lon": 78.0037 },
      { "id": 1277351, "name": "Koppal", "lat": 15.3462, "lon": 76.1480 },
      { "id": 1277352, "name": "Mandya", "lat": 12.5211, "lon": 76.8978 },
      { "id": 1277353, "name": "Mysuru", "lat": 12.2958, "lon": 76.6394 },
      { "id": 1277354, "name": "Raichur", "lat": 16.2074, "lon": 77.3648 },
      { "id": 1277355, "name": "Ramanagara", "lat": 12.8328, "lon": 77.3066 },
      { "id": 1277356, "name": "Shimoga", "lat": 13.9410, "lon": 75.5600 },
      { "id": 1277357, "name": "Tumkur", "lat": 13.3400, "lon": 77.1014 },
      { "id": 1277358, "name": "Udupi", "lat": 13.3400, "lon": 74.7400 },
      { "id": 1277359, "name": "Uttara Kannada", "lat": 14.8091, "lon": 74.3490 },
      { "id": 1277360, "name": "Vijayapura", "lat": 16.8292, "lon": 75.7154 },
      { "id": 1277361, "name": "Yadgir", "lat": 16.1810, "lon": 77.1531 }
    ],
    'kerala': [
      { "id": 1273878, "name": "Thiruvananthapuram", "lat": 8.5241, "lon": 76.9366 },
      { "id": 1273879, "name": "Kollam", "lat": 8.8910, "lon": 76.6141 },
      { "id": 1273880, "name": "Pathanamthitta", "lat": 9.2667, "lon": 76.7833 },
      { "id": 1273881, "name": "Alappuzha", "lat": 9.5000, "lon": 76.3400 },
      { "id": 1273882, "name": "Kottayam", "lat": 9.5916, "lon": 76.5226 },
      { "id": 1273883, "name": "Idukki", "lat": 9.9400, "lon": 77.1000 },
      { "id": 1273884, "name": "Ernakulam", "lat": 10.0167, "lon": 76.2833 },
      { "id": 1273885, "name": "Thrissur", "lat": 10.5276, "lon": 76.2144 },
      { "id": 1273886, "name": "Palakkad", "lat": 10.7764, "lon": 76.6546 },
      { "id": 1273887, "name": "Malappuram", "lat": 11.0000, "lon": 76.0667 },
      { "id": 1273888, "name": "Wayanad", "lat": 11.6100, "lon": 76.1600 },
      { "id": 1273889, "name": "Kasaragod", "lat": 12.4985, "lon": 75.0000 },
      { "id": 1273890, "name": "Kannur", "lat": 11.8724, "lon": 75.3704 },
      { "id": 1273891, "name": "Kozhikode", "lat": 11.2588, "lon": 75.7804 }
    ],
    'madhya_pradesh': [
      { "id": 1264529, "name": "Ashoknagar", "lat": 24.1842, "lon": 77.3561 },
      { "id": 1264530, "name": "Balaghat", "lat": 21.7794, "lon": 80.1990 },
      { "id": 1264531, "name": "Barwani", "lat": 21.9460, "lon": 74.8958 },
      { "id": 1264532, "name": "Betul", "lat": 21.9205, "lon": 77.0785 },
      { "id": 1264533, "name": "Bhind", "lat": 26.5664, "lon": 78.7756 },
      { "id": 1264534, "name": "Bhopal", "lat": 23.2599, "lon": 77.4126 },
      { "id": 1264535, "name": "Burhanpur", "lat": 21.3090, "lon": 76.2254 },
      { "id": 1264536, "name": "Chhindwara", "lat": 22.0217, "lon": 78.9346 },
      { "id": 1264537, "name": "Damoh", "lat": 23.8261, "lon": 79.4397 },
      { "id": 1264538, "name": "Datia", "lat": 25.6900, "lon": 78.6100 },
      { "id": 1264539, "name": "Dewas", "lat": 22.9654, "lon": 76.0539 },
      { "id": 1264540, "name": "Dhar", "lat": 22.5912, "lon": 75.3884 },
      { "id": 1264541, "name": "Dindori", "lat": 22.6737, "lon": 81.1350 },
      { "id": 1264542, "name": "Guna", "lat": 24.6560, "lon": 77.2960 },
      { "id": 1264543, "name": "Gwalior", "lat": 26.2183, "lon": 78.1828 },
      { "id": 1264544, "name": "Harda", "lat": 22.3875, "lon": 77.2231 },
      { "id": 1264545, "name": "Hoshangabad", "lat": 22.7613, "lon": 77.9652 },
      { "id": 1264546, "name": "Indore", "lat": 22.7196, "lon": 75.8577 },
      { "id": 1264547, "name": "Jabalpur", "lat": 23.1815, "lon": 79.9663 },
      { "id": 1264548, "name": "Jhabua", "lat": 22.7371, "lon": 74.3225 },
      { "id": 1264549, "name": "Katni", "lat": 23.8261, "lon": 80.3790 },
      { "id": 1264550, "name": "Khandwa", "lat": 21.8311, "lon": 76.0640 },
      { "id": 1264551, "name": "Mandla", "lat": 22.3930, "lon": 80.3314 },
      { "id": 1264552, "name": "Mandsaur", "lat": 23.6060, "lon": 75.0740 },
      { "id": 1264553, "name": "Morena", "lat": 26.5019, "lon": 78.0523 },
      { "id": 1264554, "name": "Narsinghpur", "lat": 22.7563, "lon": 79.2401 },
      { "id": 1264555, "name": "Neemuch", "lat": 24.5360, "lon": 75.2590 },
      { "id": 1264556, "name": "Panna", "lat": 24.5720, "lon": 80.2260 },
      { "id": 1264557, "name": "Raisen", "lat": 23.2996, "lon": 77.7999 },
      { "id": 1264558, "name": "Rajgarh", "lat": 23.2278, "lon": 77.5625 },
      { "id": 1264559, "name": "Ratlam", "lat": 23.3310, "lon": 75.0178 },
      { "id": 1264560, "name": "Rewa", "lat": 24.5854, "lon": 81.2951 },
      { "id": 1264561, "name": "Sagar", "lat": 23.4738, "lon": 78.6540 },
      { "id": 1264562, "name": "Satna", "lat": 24.5706, "lon": 80.8440 },
      { "id": 1264563, "name": "Sehore", "lat": 23.2428, "lon": 77.0887 },
      { "id": 1264564, "name": "Seni", "lat": 24.5671, "lon": 80.0748 },
      { "id": 1264565, "name": "Shahdol", "lat": 23.2488, "lon": 81.3141 },
      { "id": 1264566, "name": "Shajapur", "lat": 23.3747, "lon": 76.9756 },
      { "id": 1264567, "name": "Sheopur", "lat": 25.5798, "lon": 76.9540 },
      { "id": 1264568, "name": "Sidhi", "lat": 24.6797, "lon": 81.2784 },
      { "id": 1264569, "name": "Singrauli", "lat": 24.2081, "lon": 82.6830 },
      { "id": 1264570, "name": "Tikamgarh", "lat": 24.6450, "lon": 78.8330 },
      { "id": 1264571, "name": "Ujjain", "lat": 23.1786, "lon": 75.7797 },
      { "id": 1264572, "name": "Umaria", "lat": 23.3427, "lon": 81.4078 },
      { "id": 1264573, "name": "Vidisha", "lat": 23.5218, "lon": 77.8064 },
      { "id": 1264574, "name": "Waraseoni", "lat": 21.7006, "lon": 80.4534 }
    ],
    'maharashtra': [
      { "id": 1259221, "name": "Ahmednagar", "lat": 19.0968, "lon": 74.6383 },
      { "id": 1259222, "name": "Akola", "lat": 20.7063, "lon": 76.9826 },
      { "id": 1259223, "name": "Amravati", "lat": 20.9333, "lon": 77.7833 },
      { "id": 1259224, "name": "Aurangabad", "lat": 19.8772, "lon": 75.3433 },
      { "id": 1259225, "name": "Beed", "lat": 19.2650, "lon": 75.7444 },
      { "id": 1259226, "name": "Bhandara", "lat": 21.1642, "lon": 79.3884 },
      { "id": 1259227, "name": "Buldhana", "lat": 20.5789, "lon": 76.1944 },
      { "id": 1259228, "name": "Chandrapur", "lat": 19.9592, "lon": 79.2987 },
      { "id": 1259229, "name": "Dhule", "lat": 20.9083, "lon": 74.7750 },
      { "id": 1259230, "name": "Gadchiroli", "lat": 20.1792, "lon": 80.3875 },
      { "id": 1259231, "name": "Gondia", "lat": 21.4592, "lon": 81.5236 },
      { "id": 1259232, "name": "Jalgaon", "lat": 21.0144, "lon": 75.5600 },
      { "id": 1259233, "name": "Jalna", "lat": 19.8408, "lon": 75.8808 },
      { "id": 1259234, "name": "Kolhapur", "lat": 16.7050, "lon": 74.2198 },
      { "id": 1259235, "name": "Latur", "lat": 18.4060, "lon": 76.0162 },
      { "id": 1259236, "name": "Mumbai City", "lat": 18.9647, "lon": 72.8258 },
      { "id": 1259237, "name": "Mumbai Suburban", "lat": 19.1111, "lon": 72.8479 },
      { "id": 1259238, "name": "Nagpur", "lat": 21.1466, "lon": 79.0882 },
      { "id": 1259239, "name": "Nanded", "lat": 19.1650, "lon": 77.2833 },
      { "id": 1259240, "name": "Nandurbar", "lat": 21.3792, "lon": 74.1261 },
      { "id": 1259241, "name": "Nasik", "lat": 20.0110, "lon": 73.7898 },
      { "id": 1259242, "name": "Osmanabad", "lat": 18.1917, "lon": 76.1500 },
      { "id": 1259243, "name": "Palghar", "lat": 19.7064, "lon": 72.7825 },
      { "id": 1259244, "name": "Pune", "lat": 18.5196, "lon": 73.8550 },
      { "id": 1259245, "name": "Raigad", "lat": 18.3245, "lon": 73.0890 },
      { "id": 1259246, "name": "Ratanagiri", "lat": 16.9893, "lon": 73.3120 },
      { "id": 1259247, "name": "Sangli", "lat": 16.8600, "lon": 74.5725 },
      { "id": 1259248, "name": "Satara", "lat": 17.6900, "lon": 73.5477 },
      { "id": 1259249, "name": "Sindhudurg", "lat": 15.8976, "lon": 73.4938 },
      { "id": 1259250, "name": "Solapur", "lat": 17.6588, "lon": 75.9064 },
      { "id": 1259251, "name": "Thane", "lat": 19.2183, "lon": 72.9781 },
      { "id": 1259252, "name": "Wardha", "lat": 20.7494, "lon": 78.5904 },
      { "id": 1259253, "name": "Washim", "lat": 20.5227, "lon": 77.1240 },
      { "id": 1259254, "name": "Yavatmal", "lat": 20.3858, "lon": 78.1150 }
    ],
    'manipur': [
      { "id": 1254361, "name": "Bishnupur", "lat": 24.6138, "lon": 93.7760 },
      { "id": 1254362, "name": "Chandel", "lat": 24.1968, "lon": 94.1148 },
      { "id": 1254363, "name": "Churachandpur", "lat": 24.3314, "lon": 93.6760 },
      { "id": 1254364, "name": "Imphal East", "lat": 24.8081, "lon": 93.9611 },
      { "id": 1254365, "name": "Imphal West", "lat": 24.8074, "lon": 93.9381 },
      { "id": 1254366, "name": "Jiribam", "lat": 24.6667, "lon": 93.1667 },
      { "id": 1254367, "name": "Kakching", "lat": 24.4949, "lon": 93.9810 },
      { "id": 1254368, "name": "Kamjong", "lat": 24.9856, "lon": 94.4859 },
      { "id": 1254369, "name": "Kangpokpi", "lat": 25.1833, "lon": 93.8667 },
      { "id": 1254370, "name": "Noney", "lat": 24.7986, "lon": 93.4708 },
      { "id": 1254371, "name": "Pherzawl", "lat": 24.1941, "lon": 93.2400 },
      { "id": 1254372, "name": "Senapati", "lat": 25.2711, "lon": 94.0142 },
      { "id": 1254373, "name": "Tamenglong", "lat": 24.9835, "lon": 93.5036 },
      { "id": 1254374, "name": "Tengnoupal", "lat": 24.2395, "lon": 94.0425 },
      { "id": 1254375, "name": "Thoubal", "lat": 24.6383, "lon": 93.9994 },
      { "id": 1254376, "name": "Ukhrul", "lat": 25.1280, "lon": 94.3575 }
    ],
    'meghalaya': [
      { "id": 1255036, "name": "East Garo Hills", "lat": 25.5519, "lon": 90.6144 },
      { "id": 1255037, "name": "East Jaintia Hills", "lat": 25.3445, "lon": 92.4613 },
      { "id": 1255038, "name": "East Khasi Hills", "lat": 25.5377, "lon": 91.9116 },
      { "id": 1255039, "name": "North Garo Hills", "lat": 25.9628, "lon": 90.5235 },
      { "id": 1255040, "name": "Ri-Bhoi", "lat": 25.9022, "lon": 91.8789 },
      { "id": 1255041, "name": "South Garo Hills", "lat": 25.3255, "lon": 90.6220 },
      { "id": 1255042, "name": "South West Garo Hills", "lat": 25.3566, "lon": 89.9786 },
      { "id": 1255043, "name": "South West Khasi Hills", "lat": 25.2959, "lon": 91.2631 },
      { "id": 1255044, "name": "West Garo Hills", "lat": 25.4670, "lon": 90.2189 },
      { "id": 1255045, "name": "West Jaintia Hills", "lat": 25.4720, "lon": 92.1937 },
      { "id": 1255046, "name": "West Khasi Hills", "lat": 25.5179, "lon": 91.2831 },
      { "id": 1255047, "name": "Eastern West Khasi Hills", "lat": 25.5113, "lon": 91.4287 }
    ],
    'mizoram': [
      { "id": 1255050, "name": "Aizawl", "lat": 23.1645, "lon": 92.9376 },
      { "id": 1255051, "name": "Champhai", "lat": 23.1613, "lon": 93.2677 },
      { "id": 1255052, "name": "Kolasib", "lat": 24.0847, "lon": 92.4921 },
      { "id": 1255053, "name": "Lawngtlai", "lat": 22.6456, "lon": 92.5585 },
      { "id": 1255054, "name": "Lunglei", "lat": 22.7776, "lon": 92.7118 },
      { "id": 1255055, "name": "Mamit", "lat": 23.3884, "lon": 92.9404 },
      { "id": 1255056, "name": "Saitual", "lat": 23.0246, "lon": 92.6837 },
      { "id": 1255057, "name": "Serchhip", "lat": 23.2076, "lon": 92.6700 },
      { "id": 1255058, "name": "Siaha", "lat": 22.5296, "lon": 92.4170 },
      { "id": 1255059, "name": "Lunglei", "lat": 22.7776, "lon": 92.7118 },
      { "id": 1255060, "name": "Aizawl", "lat": 23.1645, "lon": 92.9376 }
    ],
    'nagaland': [
      { "id": 1254650, "name": "Dimapur", "lat": 25.9110, "lon": 93.7500 },
      { "id": 1254651, "name": "Kiphire", "lat": 26.4054, "lon": 94.7922 },
      { "id": 1254652, "name": "Kohima", "lat": 25.6700, "lon": 85.0000 },
      { "id": 1254653, "name": "Longleng", "lat": 26.2012, "lon": 94.7766 },
      { "id": 1254654, "name": "Mokokchung", "lat": 26.2083, "lon": 94.5222 },
      { "id": 1254655, "name": "Mon", "lat": 26.5600, "lon": 94.0500 },
      { "id": 1254656, "name": "Phek", "lat": 25.7989, "lon": 93.8892 },
      { "id": 1254657, "name": "Tuensang", "lat": 26.3031, "lon": 94.5758 },
      { "id": 1254658, "name": "Wokha", "lat": 26.1800, "lon": 94.2475 },
      { "id": 1254659, "name": "Zunheboto", "lat": 26.0281, "lon": 94.3200 },
      { "id": 1254660, "name": "Chümoukedima", "lat": 25.8800, "lon": 93.7400 },
      { "id": 1254661, "name": "Peren", "lat": 26.3500, "lon": 93.6900 },
      { "id": 1254662, "name": "Wokha", "lat": 26.1800, "lon": 94.2475 },
      { "id": 1254663, "name": "Kohima", "lat": 25.6700, "lon": 85.0000 },
      { "id": 1254664, "name": "Dimapur", "lat": 25.9110, "lon": 93.7500 },
      { "id": 1254665, "name": "Mokokchung", "lat": 26.2083, "lon": 94.5222 }
    ],
    'odisha': [
      { "id": 1254274, "name": "Angul", "lat": 20.7910, "lon": 85.8314 },
      { "id": 1254275, "name": "Bargarh", "lat": 20.4600, "lon": 83.5694 },
      { "id": 1254276, "name": "Bhadrak", "lat": 21.0108, "lon": 86.4930 },
      { "id": 1254277, "name": "Bolangir", "lat": 20.7258, "lon": 83.4578 },
      { "id": 1254278, "name": "Boudh", "lat": 20.7000, "lon": 84.5000 },
      { "id": 1254279, "name": "Cuttack", "lat": 20.4625, "lon": 85.8828 },
      { "id": 1254280, "name": "Deogarh", "lat": 21.5486, "lon": 84.9701 },
      { "id": 1254281, "name": "Dhenkanal", "lat": 20.6750, "lon": 85.6125 },
      { "id": 1254282, "name": "Ganjam", "lat": 19.3200, "lon": 84.7800 },
      { "id": 1254283, "name": "Gajapati", "lat": 19.2925, "lon": 84.0361 },
      { "id": 1254284, "name": "Jagatsinghpur", "lat": 20.2447, "lon": 86.2830 },
      { "id": 1254285, "name": "Jajpur", "lat": 20.7778, "lon": 86.3556 },
      { "id": 1254286, "name": "Jharsuguda", "lat": 21.8671, "lon": 84.0343 },
      { "id": 1254287, "name": "Kalahandi", "lat": 19.5408, "lon": 82.4367 },
      { "id": 1254288, "name": "Kandhamal", "lat": 19.9981, "lon": 84.0556 },
      { "id": 1254289, "name": "Kendrapara", "lat": 20.3790, "lon": 86.5350 },
      { "id": 1254290, "name": "Kendujhar", "lat": 22.7640, "lon": 85.6167 },
      { "id": 1254291, "name": "Khurda", "lat": 20.2333, "lon": 85.8311 },
      { "id": 1254292, "name": "Koraput", "lat": 19.2856, "lon": 82.7103 },
      { "id": 1254293, "name": "Malkangiri", "lat": 17.6944, "lon": 81.5306 },
      { "id": 1254294, "name": "Nabarangpur", "lat": 19.1453, "lon": 82.5500 },
      { "id": 1254295, "name": "Nayagarh", "lat": 20.2288, "lon": 85.2783 },
      { "id": 1254296, "name": "Nuapada", "lat": 20.3614, "lon": 82.4597 },
      { "id": 1254297, "name": "Puri", "lat": 19.8189, "lon": 85.8318 },
      { "id": 1254298, "name": "Rayagada", "lat": 19.2828, "lon": 82.4272 },
      { "id": 1254299, "name": "Sambalpur", "lat": 21.4667, "lon": 83.7833 },
      { "id": 1254300, "name": "Subarnapur", "lat": 20.8200, "lon": 83.6800 },
      { "id": 1254301, "name": "Sundargarh", "lat": 22.0850, "lon": 84.0350 },
      { "id": 1254302, "name": "Ganjam", "lat": 19.3200, "lon": 84.7800 },
      { "id": 1254303, "name": "Gajapati", "lat": 19.2925, "lon": 84.0361 },
      { "id": 1254304, "name": "Jagatsinghpur", "lat": 20.2447, "lon": 86.2830 },
      { "id": 1254305, "name": "Jajpur", "lat": 20.7778, "lon": 86.3556 },
      { "id": 1254306, "name": "Jharsuguda", "lat": 21.8671, "lon": 84.0343 },
      { "id": 1254307, "name": "Kalahandi", "lat": 19.5408, "lon": 82.4367 },
      { "id": 1254308, "name": "Kandhamal", "lat": 19.9981, "lon": 84.0556 },
      { "id": 1254309, "name": "Kendrapara", "lat": 20.3790, "lon": 86.5350 },
      { "id": 1254310, "name": "Kendujhar", "lat": 22.7640, "lon": 85.6167 },
      { "id": 1254311, "name": "Khurda", "lat": 20.2333, "lon": 85.8311 },
      { "id": 1254312, "name": "Koraput", "lat": 19.2856, "lon": 82.7103 },
      { "id": 1254313, "name": "Malkangiri", "lat": 17.6944, "lon": 81.5306 },
      { "id": 1254314, "name": "Nabarangpur", "lat": 19.1453, "lon": 82.5500 },
      { "id": 1254315, "name": "Nayagarh", "lat": 20.2288, "lon": 85.2783 },
      { "id": 1254316, "name": "Nuapada", "lat": 20.3614, "lon": 82.4597 },
      { "id": 1254317, "name": "Puri", "lat": 19.8189, "lon": 85.8318 },
      { "id": 1254318, "name": "Rayagada", "lat": 19.2828, "lon": 82.4272 },
      { "id": 1254319, "name": "Sambalpur", "lat": 21.4667, "lon": 83.7833 },
      { "id": 1254320, "name": "Subarnapur", "lat": 20.8200, "lon": 83.6800 },
      { "id": 1254321, "name": "Sundargarh", "lat": 22.0850, "lon": 84.0350 }
    ],
    'puducherry': [
      { "id": 1254473, "name": "Puducherry", "lat": 11.9416, "lon": 79.8083 },
      { "id": 1254474, "name": "Karaikal", "lat": 10.9270, "lon": 79.8326 },
      { "id": 1254475, "name": "Mahe", "lat": 11.6897, "lon": 75.5102 },
      { "id": 1254476, "name": "Yanam", "lat": 16.7333, "lon": 82.2167 }
    ],
    'punjab': [
      { "id": 1264525, "name": "Amritsar", "lat": 31.6162, "lon": 74.8660 },
      { "id": 1264526, "name": "Barnala", "lat": 30.3833, "lon": 75.5667 },
      { "id": 1264527, "name": "Bathinda", "lat": 30.2108, "lon": 74.9481 },
      { "id": 1264528, "name": "Fatehgarh Sahib", "lat": 30.6460, "lon": 76.3216 },
      { "id": 1264529, "name": "Firozpur", "lat": 30.9333, "lon": 74.6167 },
      { "id": 1264530, "name": "Faridkot", "lat": 30.6786, "lon": 74.7500 },
      { "id": 1264531, "name": "Gurdaspur", "lat": 32.0654, "lon": 75.5078 },
      { "id": 1264532, "name": "Hoshiarpur", "lat": 31.5320, "lon": 75.9690 },
      { "id": 1264533, "name": "Jalandhar", "lat": 31.3260, "lon": 75.5762 },
      { "id": 1264534, "name": "Kapurthala", "lat": 31.3678, "lon": 75.3923 },
      { "id": 1264535, "name": "Ludhiana", "lat": 30.9002, "lon": 75.8573 },
      { "id": 1264536, "name": "Mansa", "lat": 29.9866, "lon": 75.3970 },
      { "id": 1264537, "name": "Moga", "lat": 30.8206, "lon": 75.1570 },
      { "id": 1264538, "name": "Muktsar", "lat": 30.4848, "lon": 74.5531 },
      { "id": 1264539, "name": "Nawanshahr", "lat": 31.0932, "lon": 76.0146 },
      { "id": 1264540, "name": "Pathankot", "lat": 32.2660, "lon": 75.6436 },
      { "id": 1264541, "name": "Patiala", "lat": 30.3396, "lon": 76.3860 },
      { "id": 1264542, "name": "Rupnagar", "lat": 30.9785, "lon": 76.5330 },
      { "id": 1264543, "name": "Sangrur", "lat": 30.2324, "lon": 75.8491 },
      { "id": 1264544, "name": "Shaheed Bhagat Singh Nagar", "lat": 31.0670, "lon": 76.0355 },
      { "id": 1264545, "name": "Sri Muktsar Sahib", "lat": 30.4916, "lon": 74.5505 },
      { "id": 1264546, "name": "Tarn Taran", "lat": 31.4852, "lon": 74.9155 }
    ],
    'rajasthan': [
      { "id": 1254520, "name": "Ajmer", "lat": 26.4532, "lon": 74.6399 },
      { "id": 1254521, "name": "Alwar", "lat": 27.5544, "lon": 76.6350 },
      { "id": 1254522, "name": "Banswara", "lat": 23.5520, "lon": 73.0548 },
      { "id": 1254523, "name": "Baran", "lat": 25.0147, "lon": 76.6312 },
      { "id": 1254524, "name": "Barmer", "lat": 25.7490, "lon": 71.4333 },
      { "id": 1254525, "name": "Bharatpur", "lat": 27.2112, "lon": 77.4895 },
      { "id": 1254526, "name": "Bhilwara", "lat": 25.3450, "lon": 74.6417 },
      { "id": 1254527, "name": "Bikaner", "lat": 28.0221, "lon": 73.3118 },
      { "id": 1254528, "name": "Bundi", "lat": 25.4527, "lon": 75.6330 },
      { "id": 1254529, "name": "Chittorgarh", "lat": 24.8894, "lon": 74.6267 },
      { "id": 1254530, "name": "Churu", "lat": 27.9110, "lon": 73.6655 },
      { "id": 1254531, "name": "Dausa", "lat": 26.7790, "lon": 76.0595 },
      { "id": 1254532, "name": "Dholpur", "lat": 26.6895, "lon": 77.0561 },
      { "id": 1254533, "name": "Dungarpur", "lat": 23.8450, "lon": 73.7588 },
      { "id": 1254534, "name": "Ganganagar", "lat": 29.9167, "lon": 73.7333 },
      { "id": 1254535, "name": "Hanumangarh", "lat": 29.5850, "lon": 74.4878 },
      { "id": 1254536, "name": "Jaipur", "lat": 26.9124, "lon": 75.7873 },
      { "id": 1254537, "name": "Jaisalmer", "lat": 26.9157, "lon": 70.9160 },
      { "id": 1254538, "name": "Jalore", "lat": 25.3440, "lon": 72.6348 },
      { "id": 1254539, "name": "Jhalawar", "lat": 23.6262, "lon": 76.1671 },
      { "id": 1254540, "name": "Jhunjhunu", "lat": 28.1158, "lon": 75.3917 },
      { "id": 1254541, "name": "Jodhpur", "lat": 26.2916, "lon": 73.0169 },
      { "id": 1254542, "name": "Karauli", "lat": 26.4890, "lon": 77.0100 },
      { "id": 1254543, "name": "Nagaur", "lat": 27.2000, "lon": 73.7167 },
      { "id": 1254544, "name": "Pali", "lat": 25.7771, "lon": 73.4066 },
      { "id": 1254545, "name": "Rajasthan", "lat": 26.0841, "lon": 73.6634 },
      { "id": 1254546, "name": "Sawai Madhopur", "lat": 26.0139, "lon": 76.3893 },
      { "id": 1254547, "name": "Sikar", "lat": 27.6165, "lon": 75.1500 },
      { "id": 1254548, "name": "Sirohi", "lat": 24.5956, "lon": 72.8365 },
      { "id": 1254549, "name": "Tonk", "lat": 26.1562, "lon": 75.7789 },
      { "id": 1254550, "name": "Udaipur", "lat": 24.5718, "lon": 73.6915 }
    ],
    'sikkim': [
      { "id": 1254361, "name": "East Sikkim", "lat": 27.3289, "lon": 88.6198 },
      { "id": 1254362, "name": "North Sikkim", "lat": 28.1670, "lon": 88.6122 },
      { "id": 1254363, "name": "South Sikkim", "lat": 27.0981, "lon": 88.6100 },
      { "id": 1254364, "name": "West Sikkim", "lat": 27.1960, "lon": 88.6210 },
      { "id": 1254365, "name": "Gangtok", "lat": 27.3389, "lon": 88.6065 },
      { "id": 1254366, "name": "Pelling", "lat": 27.2132, "lon": 88.6097 }
    ],
    'tamil_nadu': [
      { "id": 1254524, "name": "Ariyalur", "lat": 11.1547, "lon": 78.6572 },
      { "id": 1254525, "name": "Chengalpattu", "lat": 12.6592, "lon": 80.0406 },
      { "id": 1254526, "name": "Chennai", "lat": 13.0827, "lon": 80.2707 },
      { "id": 1254527, "name": "Coimbatore", "lat": 11.0168, "lon": 76.9558 },
      { "id": 1254528, "name": "Cuddalore", "lat": 11.7485, "lon": 79.8283 },
      { "id": 1254529, "name": "Dharmapuri", "lat": 12.1315, "lon": 78.2147 },
      { "id": 1254530, "name": "Dindigul", "lat": 10.3644, "lon": 77.9783 },
      { "id": 1254531, "name": "Erode", "lat": 11.3414, "lon": 77.7167 },
      { "id": 1254532, "name": "Kancheepuram", "lat": 12.8330, "lon": 79.7030 },
      { "id": 1254533, "name": "Kanyakumari", "lat": 8.0892, "lon": 77.5385 },
      { "id": 1254534, "name": "Karur", "lat": 10.9588, "lon": 78.0778 },
      { "id": 1254535, "name": "Krishnagiri", "lat": 12.5271, "lon": 77.9782 },
      { "id": 1254536, "name": "Madurai", "lat": 9.9251, "lon": 78.1194 },
      { "id": 1254537, "name": "Nagapattinam", "lat": 10.7616, "lon": 79.8280 },
      { "id": 1254538, "name": "Namakkal", "lat": 11.2152, "lon": 78.1684 },
      { "id": 1254539, "name": "Nilgiris", "lat": 11.3938, "lon": 76.7407 },
      { "id": 1254540, "name": "Perambalur", "lat": 11.1947, "lon": 78.8006 },
      { "id": 1254541, "name": "Pudukottai", "lat": 10.3883, "lon": 78.8263 },
      { "id": 1254542, "name": "Ramanathapuram", "lat": 9.3536, "lon": 78.5654 },
      { "id": 1254543, "name": "Salem", "lat": 11.6643, "lon": 78.1460 },
      { "id": 1254544, "name": "Sivaganga", "lat": 9.8235, "lon": 78.5664 },
      { "id": 1254545, "name": "Tenkasi", "lat": 8.9323, "lon": 77.4047 },
      { "id": 1254546, "name": "Thanjavur", "lat": 10.7905, "lon": 79.1393 },
      { "id": 1254547, "name": "Theni", "lat": 10.0626, "lon": 77.5192 },
      { "id": 1254548, "name": "Thoothukudi", "lat": 8.8006, "lon": 78.1328 },
      { "id": 1254549, "name": "Tiruchirappalli", "lat": 10.7905, "lon": 78.7047 },
      { "id": 1254550, "name": "Tirunelveli", "lat": 8.7157, "lon": 77.7553 },
      { "id": 1254551, "name": "Tirupathur", "lat": 12.4087, "lon": 78.6197 },
      { "id": 1254552, "name": "Tiruppur", "lat": 11.2788, "lon": 77.3395 },
      { "id": 1254553, "name": "Tiruvallur", "lat": 13.1821, "lon": 79.6702 },
      { "id": 1254554, "name": "Tiruvannamalai", "lat": 12.2349, "lon": 79.0737 },
      { "id": 1254555, "name": "Vellore", "lat": 12.9165, "lon": 79.1328 },
      { "id": 1254556, "name": "Viluppuram", "lat": 11.9397, "lon": 79.3504 },
      { "id": 1254557, "name": "Virudhunagar", "lat": 9.6834, "lon": 77.9633 },
      { "id": 1254558, "name": "Chennai Suburban", "lat": 13.0827, "lon": 80.2707 }
    ],
    'tripura': [
      { "id": 1254605, "name": "Dhalai", "lat": 23.0612, "lon": 91.4084 },
      { "id": 1254606, "name": "Khowai", "lat": 23.1886, "lon": 91.5614 },
      { "id": 1254607, "name": "North Tripura", "lat": 24.1190, "lon": 91.6791 },
      { "id": 1254608, "name": "South Tripura", "lat": 23.5445, "lon": 91.2060 },
      { "id": 1254609, "name": "West Tripura", "lat": 23.8318, "lon": 91.2864 },
      { "id": 1254610, "name": "Gomati", "lat": 23.3313, "lon": 91.2835 },
      { "id": 1254611, "name": "Sepahijala", "lat": 23.3727, "lon": 91.3198 },
      { "id": 1254612, "name": "Unakoti", "lat": 24.2235, "lon": 91.2075 }
    ],
    'uttar_pradesh': [
      { "id": 1254526, "name": "Agra", "lat": 27.1767, "lon": 78.0081 },
      { "id": 1254527, "name": "Aligarh", "lat": 27.8824, "lon": 78.0780 },
      { "id": 1254528, "name": "Ambedkar Nagar", "lat": 26.5563, "lon": 82.3740 },
      { "id": 1254529, "name": "Amethi", "lat": 26.2236, "lon": 81.0140 },
      { "id": 1254530, "name": "Auraiya", "lat": 26.1290, "lon": 79.4325 },
      { "id": 1254531, "name": "Badaun", "lat": 28.0181, "lon": 79.1561 },
      { "id": 1254532, "name": "Baghpat", "lat": 28.9560, "lon": 77.2194 },
      { "id": 1254533, "name": "Bahraich", "lat": 27.5667, "lon": 81.6333 },
      { "id": 1254534, "name": "Balrampur", "lat": 27.4167, "lon": 81.6333 },
      { "id": 1254535, "name": "Banda", "lat": 25.4833, "lon": 80.7833 },
      { "id": 1254536, "name": "Barabanki", "lat": 26.8797, "lon": 81.1820 },
      { "id": 1254537, "name": "Bareilly", "lat": 28.3671, "lon": 79.4309 },
      { "id": 1254538, "name": "Basti", "lat": 26.7784, "lon": 82.6800 },
      { "id": 1254539, "name": "Bhadohi", "lat": 25.3792, "lon": 82.5667 },
      { "id": 1254540, "name": "Bijnor", "lat": 28.9753, "lon": 78.1266 },
      { "id": 1254541, "name": "Budaun", "lat": 28.0181, "lon": 79.1561 },
      { "id": 1254542, "name": "Bulandshahr", "lat": 28.4037, "lon": 77.8512 },
      { "id": 1254543, "name": "Chandauli", "lat": 25.5412, "lon": 83.0151 },
      { "id": 1254544, "name": "Chitrakoot", "lat": 25.2000, "lon": 80.9167 },
      { "id": 1254545, "name": "Deoria", "lat": 26.4667, "lon": 83.7833 },
      { "id": 1254546, "name": "Etah", "lat": 27.5575, "lon": 78.6260 },
      { "id": 1254547, "name": "Etawah", "lat": 26.7728, "lon": 79.2262 },
      { "id": 1254548, "name": "Farrukhabad", "lat": 27.4073, "lon": 79.5919 },
      { "id": 1254549, "name": "Fatehpur", "lat": 25.8172, "lon": 80.9650 },
      { "id": 1254550, "name": "Faizabad", "lat": 26.7964, "lon": 82.1950 },
      { "id": 1254551, "name": "Gautam Buddha Nagar", "lat": 28.5802, "lon": 77.6528 },
      { "id": 1254552, "name": "Ghaziabad", "lat": 28.6667, "lon": 77.4167 },
      { "id": 1254553, "name": "Ghazipur", "lat": 25.5833, "lon": 83.5833 },
      { "id": 1254554, "name": "Gonda", "lat": 27.1333, "lon": 81.5833 },
      { "id": 1254555, "name": "Gorakhpur", "lat": 26.7600, "lon": 83.3732 },
      { "id": 1254556, "name": "Hamirpur", "lat": 25.9681, "lon": 80.6541 },
      { "id": 1254557, "name": "Hardoi", "lat": 27.4073, "lon": 80.1516 },
      { "id": 1254558, "name": "Hathras", "lat": 27.5903, "lon": 78.0544 },
      { "id": 1254559, "name": "Jalaun", "lat": 25.4833, "lon": 79.3167 },
      { "id": 1254560, "name": "Jaunpur", "lat": 25.7333, "lon": 82.6833 },
      { "id": 1254561, "name": "Jhansi", "lat": 25.4484, "lon": 78.5692 },
      { "id": 1254562, "name": "Kannauj", "lat": 27.0583, "lon": 79.9200 },
      { "id": 1254563, "name": "Kanpur Dehat", "lat": 26.4583, "lon": 79.9811 },
      { "id": 1254564, "name": "Kanpur Nagar", "lat": 26.4478, "lon": 80.3466 },
      { "id": 1254565, "name": "Kanshiram Nagar", "lat": 27.3916, "lon": 79.0361 },
      { "id": 1254566, "name": "Kaushambi", "lat": 25.4347, "lon": 81.0503 },
      { "id": 1254567, "name": "Kushinagar", "lat": 26.8470, "lon": 83.7817 },
      { "id": 1254568, "name": "Lakhimpur Kheri", "lat": 27.9306, "lon": 80.7881 },
      { "id": 1254569, "name": "Lalitpur", "lat": 24.6884, "lon": 78.3988 },
      { "id": 1254570, "name": "Lucknow", "lat": 26.8467, "lon": 80.9462 },
      { "id": 1254571, "name": "Maharajganj", "lat": 27.1294, "lon": 83.5306 },
      { "id": 1254572, "name": "Mahoba", "lat": 25.2892, "lon": 79.6503 },
      { "id": 1254573, "name": "Mainpuri", "lat": 27.2041, "lon": 79.0456 },
      { "id": 1254574, "name": "Mathura", "lat": 27.4910, "lon": 77.6736 },
      { "id": 1254575, "name": "Mau", "lat": 26.2167, "lon": 83.5667 },
      { "id": 1254576, "name": "Meerut", "lat": 28.9858, "lon": 77.0568 },
      { "id": 1254577, "name": "Mirzapur", "lat": 25.1456, "lon": 82.5667 },
      { "id": 1254578, "name": "Moradabad", "lat": 28.8378, "lon": 78.7760 },
      { "id": 1254579, "name": "Muzaffarnagar", "lat": 29.4686, "lon": 77.6981 },
      { "id": 1254580, "name": "Pilibhit", "lat": 28.6362, "lon": 79.8012 },
      { "id": 1254581, "name": "Pratapgarh", "lat": 25.9215, "lon": 81.6623 },
      { "id": 1254582, "name": "Raebareli", "lat": 26.2272, "lon": 81.0348 },
      { "id": 1254583, "name": "Rampur", "lat": 28.8010, "lon": 79.0248 },
      { "id": 1254584, "name": "Saharanpur", "lat": 29.9668, "lon": 77.5456 },
      { "id": 1254585, "name": "Sambhal", "lat": 28.6094, "lon": 78.5732 },
      { "id": 1254586, "name": "Sant Kabir Nagar", "lat": 26.7416, "lon": 83.1042 },
      { "id": 1254587, "name": "Shahjahanpur", "lat": 27.8833, "lon": 79.9167 },
      { "id": 1254588, "name": "Shamli", "lat": 29.4167, "lon": 77.4333 },
      { "id": 1254589, "name": "Shravasti", "lat": 27.2341, "lon": 81.5462 },
      { "id": 1254590, "name": "Sitapur", "lat": 27.5685, "lon": 80.7354 },
      { "id": 1254591, "name": "Sonbhadra", "lat": 24.6754, "lon": 82.9198 },
      { "id": 1254592, "name": "Sultanpur", "lat": 26.2540, "lon": 82.0728 },
      { "id": 1254593, "name": "Unnao", "lat": 26.5482, "lon": 80.5307 },
      { "id": 1254594, "name": "Varanasi", "lat": 25.3176, "lon": 82.9739 }
    ],
    'uttarakhand': [
      { "id": 1264530, "name": "Almora", "lat": 29.5984, "lon": 79.6837 },
      { "id": 1264531, "name": "Bageshwar", "lat": 30.2350, "lon": 79.6950 },
      { "id": 1264532, "name": "Bharatpur", "lat": 28.0920, "lon": 77.4446 },
      { "id": 1264533, "name": "Chamoli", "lat": 30.4405, "lon": 79.6900 },
      { "id": 1264534, "name": "Champawat", "lat": 29.0494, "lon": 80.0560 },
      { "id": 1264535, "name": "Dehradun", "lat": 30.3165, "lon": 78.0322 },
      { "id": 1264536, "name": "Haridwar", "lat": 29.9457, "lon": 78.1642 },
      { "id": 1264537, "name": "Nainital", "lat": 29.3792, "lon": 79.4624 },
      { "id": 1264538, "name": "Pauri Garhwal", "lat": 30.1810, "lon": 78.7467 },
      { "id": 1264539, "name": "Pithoragarh", "lat": 29.5584, "lon": 80.2081 },
      { "id": 1264540, "name": "Rudraprayag", "lat": 30.3362, "lon": 78.9895 },
      { "id": 1264541, "name": "Tehri Garhwal", "lat": 30.3170, "lon": 78.5360 },
      { "id": 1264542, "name": "Udham Singh Nagar", "lat": 28.9936, "lon": 79.4386 },
      { "id": 1264543, "name": "Uttarkashi", "lat": 30.7333, "lon": 78.4667 }
    ],
    'west_bengal': [
      { "id": 1264528, "name": "Alipurduar", "lat": 26.4930, "lon": 89.5490 },
      { "id": 1264529, "name": "Bankura", "lat": 23.2362, "lon": 87.0754 },
      { "id": 1264530, "name": "Birbhum", "lat": 23.7700, "lon": 87.0000 },
      { "id": 1264531, "name": "Burdwan", "lat": 23.2582, "lon": 87.0560 },
      { "id": 1264532, "name": "Cooch Behar", "lat": 26.3056, "lon": 89.4488 },
      { "id": 1264533, "name": "Dakshin Dinajpur", "lat": 25.4650, "lon": 88.7518 },
      { "id": 1264534, "name": "Darjeeling", "lat": 27.0350, "lon": 88.2620 },
      { "id": 1264535, "name": "Hooghly", "lat": 22.9015, "lon": 88.3912 },
      { "id": 1264536, "name": "Howrah", "lat": 22.5958, "lon": 88.2636 },
      { "id": 1264537, "name": "Jalpaiguri", "lat": 26.5318, "lon": 88.7271 },
      { "id": 1264538, "name": "Jhargram", "lat": 22.4160, "lon": 86.9920 },
      { "id": 1264539, "name": "Kalimpong", "lat": 27.0999, "lon": 88.6115 },
      { "id": 1264540, "name": "Kolkata", "lat": 22.5726, "lon": 88.3639 },
      { "id": 1264541, "name": "Malda", "lat": 25.1450, "lon": 88.1162 },
      { "id": 1264542, "name": "Medinipur", "lat": 22.4250, "lon": 87.8450 },
      { "id": 1264543, "name": "Murarai", "lat": 23.5270, "lon": 87.9054 },
      { "id": 1264544, "name": "Nadia", "lat": 23.5000, "lon": 88.7500 },
      { "id": 1264545, "name": "North 24 Parganas", "lat": 22.8000, "lon": 88.4833 },
      { "id": 1264546, "name": "North Dinajpur", "lat": 25.6034, "lon": 88.8076 },
      { "id": 1264547, "name": "Purba Medinipur", "lat": 22.3394, "lon": 87.6044 },
      { "id": 1264548, "name": "Purulia", "lat": 23.3333, "lon": 86.3667 },
      { "id": 1264549, "name": "South 24 Parganas", "lat": 22.2900, "lon": 88.2390 },
      { "id": 1264550, "name": "South Dinajpur", "lat": 25.4667, "lon": 88.7500 },
      { "id": 1264551, "name": "Uttar Dinajpur", "lat": 25.6034, "lon": 88.8076 },
      { "id": 1264552, "name": "West Burdwan", "lat": 23.2582, "lon": 87.0560 },
      { "id": 1264553, "name": "West Midnapore", "lat": 22.4250, "lon": 87.8450 },
      { "id": 1264554, "name": "West Medinipur", "lat": 22.4250, "lon": 87.8450 }
    ]
    // Add other states similarly
  };

// Function to fetch and insert data for all states with delay
async function fetchAndInsertDataWithDelay() {
  for (const [state, districts] of Object.entries(states)) {
    await fetchAndInsertDataForState(state, districts);
    // Delay of 2 minutes between each state's data fetch
    await sleep(2 * 60 * 1000);
  }
}

// Schedule the job to run every day at 7 AM


// Initial run
fetchAndInsertDataWithDelay();
