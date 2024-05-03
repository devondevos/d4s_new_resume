import express from 'express';
import bodyParser from 'body-parser';
import rateLimit from 'express-rate-limit';
import axios from 'axios';
import cors from 'cors';
import pg from 'pg';
import bcrypt from 'bcrypt';
import passport from "passport";
import { Strategy } from "passport-local";
import GoogleStrategy from "passport-google-oauth2"
import env from "dotenv";
import helmet from 'helmet';
import fs from 'fs';
import session from 'express-session';
import Redis from 'ioredis';
import connectRedis from 'connect-redis';

/*
import connectRedis from 'connect-redis';
import redis from 'redis';

i tried using them and changing my code, but it only gave me errors, so i removed it...

/node_modules/connect-redis/dist/esm/index.js:16
  let isRedis = "scanIterator" in client;
                               ^

TypeError: Cannot use 'in' operator to search for 'scanIterator' in undefined
*/

const app = express();
env.config(); //call the function needed to make your imported secrets work
const PORT = process.env.SYSTEM_PORT;
const saltRounds = parseInt(process.env.SALT_ROUNDS) //encryting passwords

app.use(bodyParser.urlencoded({extended:true})); //middleware that finds the files im sending to the client
app.set('views','views');
app.set('view engine', 'ejs');
app.use(express.static('public', { index: false, redirect: false })); //extra security (just in case)
app.use(helmet());
// Enable trust proxy
//app.set('trust proxy', true);

// Use the store in your session middleware
app.use(session({
  secret: process.env.SESSION_SECRET, //session secret
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,
    httpOnly: true, // Restricts access to the cookie to HTTP requests only
    sameSite: process.env.SESSION_SAME_SITE, // Prevents the session cookie from being sent in cross-site requests
    maxAge: 20*60*1000, // Session expiration time in milliseconds
  },
})); //stores the info of the user

app.use(passport.initialize()); //passport is needed for oauth2
app.use(passport.session());

const db = new pg.Client({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
});
db.connect()

//security
app.use(cors({
  origin: process.env.CORS_ORIGIN, // the allowed origin
  methods: process.env.CORS_METHODS, //what can be done on your website
  optionsSuccessStatus: process.env.CORS_SUCCESS_STATUS,
  credentials: process.env.CORS_CREDENTIALS,
  allowedHeaders: process.env.CORS_ALLOWED_HEADERS,
}));

//security
app.use(async (req, res, next) => {
  try {
    // Set the Content-Security-Policy header
    res.setHeader('Content-Security-Policy', process.env.IMG_SRC_VALUE);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'deny');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next(); // Move to the next middleware
  } catch(error) {
    console.error("Error getting images to be sent to the header: (2)", error);
    next(error); // Forward the error to the error handling middleware
  }
});

//generates a random password for each user
function generateRandomString(length) {
  const characters = process.env.DATABASE_RANDOM;
  let result = '';
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

//third page middleware
//calls the info from the books database, and sorts it
async function userInfo(id_of_user, userEmail, sort) {
  const query = `select * from books_read where user_id = $1 and book_user_email = $2 order by ${sort} desc`
  const result = await db.query(query, [id_of_user, userEmail])
  const allUserData = result.rows
  return allUserData
}

// Home page
app.get('/', async (req, res) => {
  let userName = req.session.user || undefined; // Calls the user info stored in the session, when you log in
  // Render the page without the modal
  res.render('index.ejs', { userHeader: userName });
});


//first page

// Handle PUT requests to '/editItem' endpoint
app.put('/editItem', (req, res) => {
  const indexToEdit = req.body.index;
  const updatedItem = req.body.updatedItem;
  let todoArray = req.session.todoArray || []

  // Ensure the index is valid
  if (indexToEdit >= 0 && indexToEdit < todoArray.length) {
    // Update the todoArray on the server side
    todoArray[indexToEdit] = updatedItem;
    req.session.todoArray = todoArray
    // Send a JSON response with the updated todoArray to the UI
    res.json({ values: todoArray });
  }
});

// Handle DELETE requests to '/removeItem' endpoint
app.delete('/removeItem', (req, res) => {
  // Retrieve the index of the item to be removed from the request body
  const indexToRemove = req.body.index;
  console.log('index: ',indexToRemove)
  let todoArray = req.session.todoArray || []
  console.log('delete todoArray: ',todoArray)

  // Remove the item from the todoArray if the index is valid
  if (indexToRemove >= 0 && indexToRemove < todoArray.length) {
    todoArray.splice(indexToRemove, 1);
  }

  req.session.todoArray = todoArray
  console.log('new todoArray: ',todoArray)
  console.log('new req.session.todoArray: ',req.session.todoArray)
  // Send a JSON response with the updated todoArray to the client
  res.json({ values: todoArray });
});

// Handle POST requests to '/form' endpoint
app.post('/form', (req, res) => {
  // Retrieve the value of the 'listItem' field from the form
  const item = req.body.listItem;
  // Array to store todo items temporarily
  let todoArray = req.session.todoArray || [];
  console.log('post todoArray (1): ',todoArray)
  // Add the item to the todoArray
  todoArray.push(item);
  console.log('push todoArray: ',todoArray)
  //adding the temporary information of the todoArray to the session
  req.session.todoArray = todoArray
  console.log('req.session (todoArray): ',req.session)
  // Send a JSON response with the updated todoArray to the client
  res.json({ values: todoArray });
});

//where the info is showed to the client regarding the todoList (im using ajax for the todoList, instead of the database)
app.get('/todoList', (req,res) => {
  let userName = req.session.user || undefined
  let todoArray = req.session.todoArray || []
  console.log('req.session.id: ',req.session.id)
  res.render('project_1', { todoArray, userHeader:userName });
})

//second page
//limiter for requests, so i don't get penalized (for second page)
const limiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hour window
  max: 10, // limit each IP to 10 requests per windowMs
});

app.get('/weatherApp', async (req, res) => {
  try {
    if (req.isAuthenticated()) {
    let userName = req.session.user;
    console.log('userName: ',userName)

    let userCount = await db.query('SELECT weathercount, time_checked FROM users WHERE user_name = $1', [userName.user_name]);

    const currentDateTime = new Date();
    const lastCheckedDate = new Date(userCount.rows[0].time_checked);

    // Check if 24 hours have passed since the last check
    if (currentDateTime - lastCheckedDate >= 24 * 60 * 60 * 1000) {
      // Reset the count and update the lastChecked date
      await db.query('UPDATE users SET weathercount = $1, time_checked = $2 WHERE user_name = $3', [10, currentDateTime, userName.user_name]);
    }
    res.render('project_2.ejs', { data: "Waiting for information", userHeader: userName });
  } else {
    res.redirect('/?showAlert=true')
  }
  } catch (error) {
    console.error("Error rendering weatherApp page:", error);
    res.redirect('/'); // Redirect to homepage in case of error
  }
});

app.post('/weatherApp',limiter, async (req,res) => {
  try {
    console.log("Rate limit remaining:", req.rateLimit.remaining);
    console.log("Time until rate limit reset (ms):", req.rateLimit.resetTime);
    let userName = req.session.user
    console.log('userName (weatherApp post: )',userName)
    //getting the location and amount of days, the user entered
    const userAddress = req.body.userAddress;
    const userSuburb = req.body.userSuburb;
    let userDays = req.body.userDays;
    if (userDays > 7) {
      userDays = 7
    }
    //trying to find the location of the user to render the latitude and longitude to the API_URL
    const locationAPI = `${process.env.WEATHERAPP_LOCATION}=${userAddress}+${userSuburb}${process.env.WEATHERAPP_5}=${process.env.WEATHERAPP_6}`
    const userLocation = await axios.get(locationAPI)

    //if there is data sent to the api
    if (userLocation.data && userLocation.data.length > 0) {
      //assigning the appropriate latitude and longitude values
      const userLatitude = userLocation.data[0].lat;
      const userLongitude = userLocation.data[0].lon;

      //the latitude and longitude is returned from the locationApi, from the location the user entered in
      const API_URL = `${process.env.WEATHERAPP_LATITUDE}=${userLatitude}${process.env.WEATHERAPP_1}=${userLongitude}${process.env.WEATHERAPP_2}=${process.env.WEATHERAPP_3}=${process.env.WEATHERAPP_4}=${userDays}`;
      //returning the api with the details from the user
      const response = await axios.get(API_URL);
      //finding the respective data from the api
      const time = response.data.hourly.time;
      const temperature_2m = response.data.hourly.temperature_2m;
      const timeZone = response.data.timezone;

      //displaying the date and time on the client side from the api's
      const currentTimeAndDay = new Date();

      //grouping the time and the temperatures together
      const weatherApp = time.map((currentTime, index) => {
        const date = new Date(currentTime);
        //only want the time value which is the second value in the array, the first value is the year-month-day
        const timeOnly = currentTime.split('T')[1];
        //getting your current time
        const currentHour = currentTimeAndDay.getHours();

        return {
          //values to display the information as i customized
          date: date.toLocaleDateString('en-US', { weekday: 'short' }),
          time: timeOnly,
          temperature_2m: temperature_2m[index],
        };
      });

      let remainingCount = req.rateLimit.remaining;
      let timeChecked = new Date(); // Current time
      await db.query('UPDATE users SET weathercount = $1, time_checked = $2 WHERE user_name = $3', [remainingCount, timeChecked, userName.user_name]);

      res.render('project_2.ejs', {userHeader:userName, timeZone:timeZone, data:weatherApp, currentTimeAndDay:currentTimeAndDay.toLocaleDateString('en-US', {weekday: 'long', hour: 'numeric', minute:'numeric', hour12:false})})
    } else {
      //if the location is not found
      console.error("No location data found");
      res.render('project_2.ejs', { userHeader:userName, data: [], errorMessage: "Location not found, try again, maybe don't type the street or avenue part." });
    }
  } catch (error) {
    //if the weatherApp breaks or fails to make a request
    console.error("Failed to make weatherApp request: ", error.message);
    res.redirect('/');
  }    
})

//project 3
app.get("/bookReview",  async (req, res) => {
  try {
    if (req.isAuthenticated()) {
      res.redirect('/home')
    } else {
      console.log('session data: ',req.user)
      let sort = req.session.sort
      let availableBooks
      if (sort !== undefined) {
        const allBooks = await db.query(`SELECT * FROM books_read order by ${sort} desc`);
        availableBooks = allBooks.rows;
      } else {
        const allBooks = await db.query('SELECT * FROM books_read');
        availableBooks = allBooks.rows;
        // Shuffle the array of books
        for (let i = availableBooks.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [availableBooks[i], availableBooks[j]] = [availableBooks[j], availableBooks[i]];
        }
      }
      // Take the first 8 books (or less if there are fewer than 8 books)
      const randomBooks = availableBooks.slice(0, 8);
      req.session.userData = randomBooks
      res.render('project_3.ejs', {users:randomBooks, pageMessage:"Welcome to my book website"})
    }
  } catch (error) {
    console.error('Error getting random details: ',error)
  }
});

app.post('/sorting', async (req,res) => {
  try {
    let sortBy = req.body.sortBy;
    if (sortBy == "rating") {
      req.session.sort = 'rating'
        if (req.isAuthenticated()) {
          res.redirect('/home')
        } else {
          res.redirect('/bookReview')
      }  
    } else if (sortBy == "entry_date") {
      req.session.sort = 'entry_date'
      if (req.isAuthenticated()) {
        res.redirect('/home')
      } else {
        res.redirect('/bookReview')
      }
    } else if (sortBy == "random") {
      req.session.sort = undefined
      if (req.isAuthenticated()) {
        res.redirect('/home')
      } else {
        res.redirect('/bookReview')
      }
    }
  } catch (error) {
    console.error('Error sorting data: ',error)
    res.redirect('/bookReview')
  }
})
  
app.get("/home", async (req, res) => {
  if (req.isAuthenticated()) {
    req.session.user = req.user
    const userEmail = req.session.user.user_name
    const userId = req.session.user.id
    let userName = req.session.user
    let selectedSort = req.session.sort
    let sort
    let pageMessage
    let users
    try {
      if (selectedSort !== undefined) {
        sort = req.session.sort
      } else {
        sort = 'book_name'
      }
      const result = await userInfo(userId,userEmail,sort)
      if (result.length !== null) {
        users=result
        req.session.userData = users
        pageMessage="Here is your Book information!"
      } else {
        users=[
          {'user1':'user2'}
        ]
        req.session.userData = users
        pageMessage="You don't have any Book information saved!"
      }
      res.render("project_3.ejs", {pageMessage:pageMessage, users:users, userHeader:userName});
    } catch (error) {
      console.log(error)
    }
  } else {
    res.redirect('/bookReview');
  }
});

app.get("/login", (req, res) => {
  res.render("project_3/login.ejs");
});
  
app.get("/register", (req, res) => {
  // Render the page without the modal
  res.render("project_3/register.ejs");
});
  
app.get("/logout", (req, res) => {
  try { 
    req.session.destroy((err) => {
      if (err) {
        req.logout(function (err) {
          if (err) {
            return next(err);
          }
        });
        console.error('Error destroying session:', err);
      } else {
        req.logout(function (err) {
          if (err) {
            return (err);
          }
        });
        console.log('Session destroyed, user logged out');
      }
    });
    res.redirect('/login')
  } catch (error) {
    console.log('error logging out: ', error)
    res.redirect('/login')
  }
});
  
app.post('/changeUser', (req,res) => {
  try {
    if (req.isAuthenticated()) {
      req.session.destroy((err) => {
        if (err) {
          req.logout(function (err) {
            if (err) {
              return next(err);
            }
          });
          console.error('Error destroying session:', err);
        } else {
          req.logout(function (err) {
            if (err) {
              return (err);
            }
          });
          console.log('Session destroyed, user changed');
        }
      });
      res.redirect('/login')
    } else {
      res.redirect('/login')
    }
  } catch (error) {
    console.error('Error changing user: ',error)
  }
})
  
app.post('/deleteUser', async (req,res) => {
  try {
    if (req.isAuthenticated()) {
      const id = req.user.id
      const user_email = req.user.user_name
      const bookResult = await db.query('delete from books_read where user_id = $1 and book_user_email = $2', [id,user_email])
      //id of the user from the user table
      const idResult = await db.query('delete from users where id = $1 and user_name = $2', [id,user_email])
      req.session.destroy((err) => {
        if (err) {
          req.logout(function (err) {
            if (err) {
              return (err);
            }
          });
          console.error('Error destroying session:', err);
        } else {
          req.logout(function (err) {
            if (err) {
              return (err);
            }
          });
        }
      });
      res.redirect('/')
    } else {
      res.redirect('/')
    }
  } catch (error) {
    console.error('Error deleting user: ',error)
  }
})
  
app.post('/newBook', async (req,res) => {
  try {
    if (req.isAuthenticated()) {
      let bookName = req.body.book_name
      let bookInfo = req.body.book_info
      let bookISBN = req.body.book_isbn
      req.session.bookISBN = bookISBN
      let fullDate = new Date();
  
      // Get the individual date components
      let day = fullDate.getDate()
      let month = fullDate.getMonth() + 1 // Months are zero-indexed, so add 1
      let year = fullDate.getFullYear();
  
      // Format the date as YYYY-MM-DD
      let date = `${day}/${month}/${year}`;
      let rating = req.body.book_rating
      req.session.rating = rating
      let isbn
      let bookCoverPage
      let authorName
      let bookTitle
      try {
        if (bookISBN !== "" && bookISBN.length >= 10) {
          isbn = bookISBN
          const response = await axios.get(`${process.env.OPENLIBRARY_ISBN}${isbn}-M.jpg`)
          bookCoverPage = response.config.url
        } else {
          //getting the isbn number from a seriers of isbn numbers
          const bookData = await axios.get(`${process.env.OPENLIBRARY_BOOKNAME}=${bookName}`)
          const books = bookData.data.docs
  
          for (const book of books) {
            //finding an isbn number that is 10 or more digits
            isbn = book.isbn.find(isbn => isbn.length >= 10)
            if (isbn) {
              //gets the url of the selected isbn number
              const response = await axios.get(`${process.env.OPENLIBRARY_ISBN}${isbn}-M.jpg`)
              const bookData = response.data
              //checks if the response.data.length is longer than 50, if it is, there is a picture, if not, there is nothing
              if (bookData.length > 50) {
                bookCoverPage = response.config.url
                authorName = book.author_name
                authorName = authorName[0]
                bookTitle = book.title
                break
              }
            }
          }
        }
        let users_id = req.session.user.id
        let users_email = req.session.user.user_name
        if (authorName == undefined || authorName == null) {
          authorName = "Can't find"
        }
        //adding the new information to the table, and returning the id, if it is a new isbn number
        const result = await db.query("insert into books_read (book_name,book_info,user_id,book_isbn,book_url,rating,entry_date,book_user_email, author_name) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)",[bookTitle,bookInfo,users_id,isbn,bookCoverPage,rating,date,users_email,authorName])
        res.redirect('/home')
      } catch (error) {
        res.redirect('/home')
      }
    }else{
      res.redirect('/bookReview')
    }
  } catch (error) {
    console.error('Error with newBook: ',error)
  }
})
  
  
app.get('/edit/:id', async (req,res) => {
  try {
    if (req.isAuthenticated()) {
      let userEmail = req.session.user.user_name
      let user = req.session.user
      const bookID = req.params.id
      const result  = await db.query('select * from books_read where id = $1 and book_user_email = $2',[bookID,userEmail])
      const editInfo = result.rows
      res.render('project_3/edit.ejs', {users:editInfo,userNameHeader:user})
      } else {
        res.redirect('/bookReview')
      }
  } catch (error) {
    console.error("Error displaying the edit page: ",error)
  }
})
  
app.post('/books/:id', async (req, res) => {
  let bookID = req.params.id;
  let user_id = req.session.user.id
  let userEmail = req.session.user.user_name
  if (req.isAuthenticated()) {
    if (req.body._method === 'DELETE') {
      try {
        // Handle DELETE request
        await db.query('delete from books_read where id = $1 and book_user_email = $2',[bookID,userEmail])
        res.redirect('/home')
      } catch (error) {
        console.error('Error deleting data from database: ',error)
      }
    } else if (req.body._method === 'PATCH') {
      try {
        // Handle PATCH request
        const bookISBN = req.body.bookISBN
        const bookName = req.body.bookName
        const bookInfo = req.body.book_info
        //if the isbn number changes, how to get the new book cover
        const response = await axios.get(`${process.env.OPENLIBRARY_ISBN}${bookISBN}-M.jpg`)
        const newBookCover = response.config.url
        let fullDate = new Date();
        // Get the individual date components
        let day = fullDate.getDate();
        let month = fullDate.getMonth() + 1; // Months are zero-indexed, so add 1
        let year = fullDate.getFullYear();
        // Format the date as DD/MM/YYYY
        let date = `${day}/${month}/${year}`
        const rating = req.body.book_rating
        await db.query('update books_read set book_name = $1, book_info = $2, user_id = $3, book_isbn = $4, book_url = $5, rating = $6, entry_date = $7 where id = $8 and book_user_email = $9',[bookName,bookInfo,user_id,bookISBN,newBookCover,rating,date,bookID,userEmail])
        res.redirect('/home')
      } catch (error) {
        console.error('Error editing data from database: ',error)
      }
    }
  }else {
    res.redirect('/bookReview')
  }
});

app.post("/register", async (req, res) => {
  const email = req.body.user_email;
  const password = req.body.userPassword;
  const userName = req.body.username
  
  try {
    const checkResult = await db.query("SELECT * FROM users WHERE user_name = $1", [
      email,
    ]);
  
    if (checkResult.rows.length > 0) {
      res.redirect("/login");
    } else {
      bcrypt.hash(password, saltRounds, async (err, hash) => {
        if (err) {
          console.error("Error hashing password (local:", err);
        } else {
          const result = await db.query(
            "INSERT INTO users (user_name, password, username, weathercount) VALUES ($1, $2, $3, $4) RETURNING *",
            [email, hash, userName, 10]
          );
          const user = result.rows[0];
          req.login(user, (err) => {
            req.session.user = user
            res.redirect("/");
          });
        }
      });
    }
  } catch (err) {
    console.log(err);
  }
});
  
app.get(
  "/auth/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
  })
);
  
app.get(
  "/auth/google/home",
  passport.authenticate("google", {
    successRedirect: "/home",
    failureRedirect: "/login",
  })
);
  
app.post(
  "/login",
  passport.authenticate("local", {
    successRedirect: "/home",
    failureRedirect: "/login",
  })
);
  
passport.use(
  "local",
  new Strategy({ usernameField: 'user_email', passwordField: 'userPassword' }, async function verify(username, password, cb) {
    try {
      const result = await db.query("SELECT * FROM users WHERE user_name = $1 ", [
        username,
      ]);
      if (result.rows.length > 0) {
        const user = result.rows[0];
        const storedHashedPassword = user.password;
        bcrypt.compare(password, storedHashedPassword, (err, valid) => {
          if (err) {
            console.error("Error comparing passwords:", err);
            return cb(err);
          } else {
            if (valid) {
              return cb(null, user.id);
            } else {
              return cb(null, false);
            }
          }
        });
      } else {
        return cb("User not found");
      }
    } catch (err) {
      console.log(err);
    }
  })
);
//for some reason, when you log in (GoogleStrategy) using an account with multiple google accounts, it doesn't go to the deserializeUser(), it only works with a single google account
//if you know how to fix it, please tell me how.
//later im going to implement the reset password. It broke my mind, im learning more about it.  
passport.use(
  "google",
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
      userProfileURL: process.env.GOOGLE_USER_PROFILE_URL,
    },
    async (accessToken, refreshToken, profile, cb) => {
      try {
        const result = await db.query("SELECT * FROM users WHERE user_name = $1", [
          profile.email,
        ]);
        bcrypt.genSalt(saltRounds, async (err,salt) => {
          if (result.rows.length === 0) {
            if (err) {
              console.log(err)
              return cb(err)
            } else {
              let password = generateRandomString(15);
              bcrypt.hash(password, salt, async (err, hash) => {
                if (err) {
                  console.error("Error hashing password, (google):", err);
                  return cb(err)
                } else {
                  const newUser = await db.query(
                    "INSERT INTO users (user_name, password, username, weathercount) VALUES ($1, $2, $3, $4)",
                    [profile.email, hash, profile.displayName, 10]
                  );
                  console.log('newUser: ',newUser[0].id)
                  return cb(null, newUser.rows[0].id);
                }
              })
            }
          } else {
            console.log('already there: ',result.rows[0].id)
            return cb(null, result.rows[0].id);
          }
        })
      } catch (err) {
        console.log('error by google')
        return cb(err);
      }
  })
)

passport.serializeUser((user, cb) => {
  console.log('user (serialization): ',user)
  cb(null, user); // Assuming user object has an `id` property
});

passport.deserializeUser(async (user, cb) => {
  console.log('called me')
  try {
    // Convert the user ID to a number (if it's not already)
    const userId = Number(user);
    
    // Query the database for the user with the specified ID
    const result = await db.query("SELECT * FROM users WHERE id = $1", [userId]);
    console.log('result: ',result.rows)

    // Check if a user was found
    if (result.rows.length > 0) {
      // If a user was found, return the first user object
      const user = result.rows[0];
      console.log('user (deserialization): ',user)
      cb(null, user);
    } else {
      // If no user was found, return an error
      cb(new Error("User not found"));
    }
  } catch (err) {
    // If an error occurred during deserialization, return the error
    console.err('error occurred during deserialization')
    cb(err);
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}.`)
})