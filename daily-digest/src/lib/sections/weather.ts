import { withRetry } from '@/lib/retry';

const CITY = 'Highland Heights';
const STATE = 'OH';
const COUNTRY = 'US';
const LAT = 41.5515;
const LON = -81.4590;

interface WeatherData {
  current: {
    temp: number;
    feelsLike: number;
    description: string;
    icon: string;
    humidity: number;
    windSpeed: number;
    windDirection: string;
  };
  forecast: Array<{
    time: string;
    temp: number;
    description: string;
    icon: string;
    precipitation: number;
  }>;
  daily: Array<{
    date: string;
    high: number;
    low: number;
    description: string;
    icon: string;
    precipitation: number;
  }>;
  location: string;
}

function windDirection(degrees: number): string {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return dirs[Math.round(degrees / 22.5) % 16];
}

export async function fetchWeather(): Promise<WeatherData> {
  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) throw new Error('OpenWeatherMap API key not configured');

  const baseUrl = 'https://api.openweathermap.org/data/3.0/onecall';
  const url = `${baseUrl}?lat=${LAT}&lon=${LON}&appid=${apiKey}&units=imperial&exclude=minutely,alerts`;

  const response = await withRetry(
    async () => {
      const res = await fetch(url);
      if (!res.ok) {
        // Fallback to 2.5 API
        const fallbackUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${LAT}&lon=${LON}&appid=${apiKey}&units=imperial`;
        const currentUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${LAT}&lon=${LON}&appid=${apiKey}&units=imperial`;

        const [currentRes, forecastRes] = await Promise.all([
          fetch(currentUrl),
          fetch(fallbackUrl),
        ]);

        if (!currentRes.ok || !forecastRes.ok) {
          throw new Error(`Weather API error: ${currentRes.status}`);
        }

        return {
          current: await currentRes.json(),
          forecast: await forecastRes.json(),
          isLegacy: true,
        };
      }
      return { data: await res.json(), isLegacy: false };
    },
    { label: 'weather' }
  );

  if (response.isLegacy) {
    const { current, forecast } = response;
    return {
      current: {
        temp: Math.round(current.main.temp),
        feelsLike: Math.round(current.main.feels_like),
        description: current.weather[0].description,
        icon: current.weather[0].icon,
        humidity: current.main.humidity,
        windSpeed: Math.round(current.wind.speed),
        windDirection: windDirection(current.wind.deg),
      },
      forecast: forecast.list.slice(0, 8).map((item: any) => ({
        time: new Date(item.dt * 1000).toLocaleTimeString('en-US', {
          hour: 'numeric',
          hour12: true,
        }),
        temp: Math.round(item.main.temp),
        description: item.weather[0].description,
        icon: item.weather[0].icon,
        precipitation: Math.round((item.pop || 0) * 100),
      })),
      daily: [],
      location: `${CITY}, ${STATE}`,
    };
  }

  const data = response.data;
  return {
    current: {
      temp: Math.round(data.current.temp),
      feelsLike: Math.round(data.current.feels_like),
      description: data.current.weather[0].description,
      icon: data.current.weather[0].icon,
      humidity: data.current.humidity,
      windSpeed: Math.round(data.current.wind_speed),
      windDirection: windDirection(data.current.wind_deg),
    },
    forecast: data.hourly.slice(0, 12).map((h: any) => ({
      time: new Date(h.dt * 1000).toLocaleTimeString('en-US', {
        hour: 'numeric',
        hour12: true,
      }),
      temp: Math.round(h.temp),
      description: h.weather[0].description,
      icon: h.weather[0].icon,
      precipitation: Math.round((h.pop || 0) * 100),
    })),
    daily: data.daily.slice(0, 5).map((d: any) => ({
      date: new Date(d.dt * 1000).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }),
      high: Math.round(d.temp.max),
      low: Math.round(d.temp.min),
      description: d.weather[0].description,
      icon: d.weather[0].icon,
      precipitation: Math.round((d.pop || 0) * 100),
    })),
    location: `${CITY}, ${STATE}, ${COUNTRY}`,
  };
}
