Discord - [![Discord](https://github.com/CLorant/readme-social-icons/raw/main/large/colored/discord.svg)](https://discord.com/invite/U3BaaB5a6t)
Youtube - [![Youtube](https://github.com/CLorant/readme-social-icons/raw/main/large/colored/youtube.svg)](https://youtube.com/@nitrobtw)

# osu! Scorecard API

The API-server backend for generating osu! scorecards. Used by the [osu!scorecard web frontend](https://github.com/NitroBTW/osuscorecard-web).

## Overview

The osu!scorecard API server is a TypeScript app designed to run standalone and connect to the frontend web-client of the osu! Scorecard Generator website. The job of this app is to grab data from the [osu!api v2](https://osu.ppy.sh/docs/index.html) and return typed data to the frontend in order to generate a scorecard.

### Key Features

- **API Data Fetching**: Get score/beatmap details from the API using its ID or URL
- **Image proxying**: Proxy images from the osu! site through the server backend so the frontend can load them reliably
- **Global Scorecard Counting**: Count the amount of generated scorecards globally

## Version 2 Improvements

This version is a significant evolution from the original:

- **TypeScript Migration**: Full conversion to TypeScript for improved type safety and developer experience
- **Improved Performance**: Better code organization and build optimization

##  **Less vibe coded slop!**

Of course the osu! community hates AI, and to be honest for anything other than throw-away code I sorta hate it too. But for a project like this last year, I had zero web development experience at all. I was good at python and that's it, so it was originally made in python and then turned into a barely working website by Claude and ChatGPT. Since then, I've gained some TypeScript and general web-dev experience and decided to completely rewrite the codebase in TypeScript. Any future features will be completely human written and the design will be human made too :D

## Tech Stack

- **Language**: TypeScript
- **Framework**: Express.js
- **Database**: SQLite3
- **HTTP Client**: Axios
- **Environment**: dotenv
- **CORS**: cors (I hate cors)

## API Endpoints
- `GET /api/map/:mapId` - Get beatmap information
- `GET /api/score/:scoreId` - Get score information  
- `GET /api/proxy-image/:type` - Proxy image requests
- `POST /api/scorecards/increment` - Increment usage counter
- `GET /api/scorecards/count` - Get usage count

### Usage

Example:
```bash
curl {BASE_URL}/api/score/6108359037
```

Response:
```json
{
    "lazer":false,
    "score": {
        "score":1036053,
        "classic_score":11182820,
        "mods":[{"acronym":"DT"},{"acronym":"HD"},{"acronym":"CL"}],
        "c300":551,
        "c100":22,
        "c50":0,
        "cEnds":0,
        "cSliders":193,
        "misses":0,
        "rank":"SH",
        "accuracy":0.974404,
        "time":"2026-01-24T19:06:43Z",
        "full_combo":false,
        "max_combo":881,
        "pp":1872.43,
        "leaderboard":4
    },
    "beatmap": {
        "id":691220,
        "title":"Crystalia",
        "difficulty":"Meal's Ultra",
        "star_rating":7.23193,
        "cover":"https://assets.ppy.sh/beatmaps/691220/covers/list@2x.jpg?1650659260","creator":"Hysteria",
        "status":"ranked"
    },
    "user": {
        "avatar_url":"https://a.ppy.sh/7562902?1771675022.jpeg",
        "country":"AU",
        "username":"mrekk",
        "user_rank":1
    }
}
```


## Installation & Development

### Environment Variables

1. Copy `example.env` to `.env` and replace the following as needed:
`CLIENT_ID` - Required osu! app client ID to access osu!api v2
`CLIENT_SECRET` - Required authorisation secret token to access the osu!api v2
`FRONTEND_URL` - The URL where your frontend is hosted. This allows to use `/api/{endpoint}` at where the base URL is your frontend URL
`PORT` - The port to listen on for API requests. This is 3000 by default.

### Prerequisites

- Node.js (v16 or higher)
- npm 

### Getting Started

1. Clone the repository:
```bash
git clone https://github.com/NitroBTW/osuscorecard-api
cd osuscorecard-api
```

2. Install dependencies:
```bash
npm install
```

3. Start development server:
```bash
npm run dev
```

## Project Structure

```
osuscorecard-api/
├── src/
│   └── server.ts       # Express Server API
├── package.json        # Project dependencies
├── tsconfig.json       # TypeScript configuration
└── README.md           # This file
```

## Social Media & Community

Connect with me and my community:

- **YouTube**: [@nitrobtw](https://www.youtube.com/@nitrobtw) - Tutorials, gameplay, and project updates
- **Discord**: [Join the TWIO community](https://discord.com/invite/U3BaaB5a6t) - Get support, share your creations, and chat with other players

## License

This project is open source and available under the [MIT License](LICENSE).

## Contact

For questions, suggestions, or contributions, please open an issue or contact me through the social media links above.

---

Made with ❤️ for the osu! community