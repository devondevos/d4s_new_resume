const toggleDropdown = () => {
    $('.dropdown').toggleClass('active');
};

/*project 1 */
// Array to store todo items
let todoArray = [];

// Function to handle the form submission when adding a new item
const submitItem = (event) => {
    // Prevent the default form submission behavior
    event.preventDefault();
    // Get the value of the input field with the ID 'listItem'
    const newItem = $("#listItem").val();
    // Perform an asynchronous operation (e.g., submit form data using ajax, jquery)
    // Check if newItem is not empty before submitting

    /*
    so why ajax, instead of using postgreSQL databases, its because i wanted to use ajax, so the page
    doesn't reload with each new addition or edit to the todoList. Also I wanted to see if i could do it.
    */

    if (newItem.trim() !== "") {
        $.ajax({
            url: '/form',                   // Server endpoint for handling form submission
            method: 'POST',                 // HTTP method for the request
            data: { listItem: newItem },    // Data to be sent to the server
            success: function (data) {
                // Callback function called on successful response from the server
                //displayValues and values are created below
                displayValues(data.values);  // Display the updated list of values
                // Clear the input field after successful submission
                $("#listItem").val('');
                // Reset the textarea to a single row after form submission
                $("#listItem").css('height', 'auto').attr('rows', 1);
            },
            error: function (error) {
                // Callback function called in case of an error
                console.error("Error: ", error);
            }
        });
    }
}

// Function to display values in the list
const displayValues = (values) => {
    // Clear the values list
    $('#itemShown').empty();
    // Display each value in the list
    values.forEach(function (todoItem, index) {
        const listItem = $('<li class="todoItemList">');
        //allows whitespaces to be preserved
        const itemContainer = $('<div class="listedItems" maxlength="2048" aria-expanded="false">' + todoItem + '</div>');
        const buttonsContainer = $('<div class="todoItemListButtons"></div>');

        // Append the "Delete" button
        const deleteButton = $('<span class="todoButton deleteButton">Delete</span>');
        deleteButton.on('click', function() {
            removeItem(index);
        });
        buttonsContainer.append(deleteButton);

        // Append the "Edit" button
        const editButton = $('<span class="todoButton editButton">Edit</span>');
        editButton.on('click', function(event) {
            editItem(index, event);
        });
        buttonsContainer.append(editButton);
        
        // Append the containers to the listItem
        listItem.append(itemContainer);
        listItem.append(buttonsContainer);

        // Append the listItem and a horizontal line to the '#itemShown' container
        $('#itemShown').append(listItem)
    });
}

// Function to remove an item from the list
const removeItem = (index) => {
    // Prevent the default form submission behavior
    // Perform an asynchronous operation (e.g., submit form data using ajax, jquery)
    $.ajax({
        url: '/removeItem',           // Server endpoint for removing an item
        method: 'DELETE',               // HTTP method for the request
        data: { index: index },       // Data to be sent to the server (index of the item to be removed)
        success: function (data) {
            // Callback function called on successful response from the server
            displayValues(data.values);  // Display the updated list of values
        },
        error: function (error) {
            // Callback function called in case of an error
            console.error("Error: ", error);
        }
    });
};

// Function to edit an item in the list
const editItem = (index, event) => {
    event.preventDefault();

    // Find the list item and the element containing the text you want to edit
    const listItemElement = $('#itemShown li').eq(index);
    const listedItemsElement = listItemElement.children(':first-child'); // Find the first child element of 'said' element

    // Get the current text value
    const currentText = listedItemsElement.text().trim();

    // Create an input field and set its value to the current text
    const inputField = $('<textarea>', { class: 'editInput', rows: 5 }).val(currentText);

    // Create an "OK" button
    const okButton = $('<button>', { text: 'OK', class: 'okButton' });

    // Function to handle editing completion
    const completeEditing = () => {

        const updatedItem = inputField.val().trim();
        // Check if the value is not empty and has changed
        if (updatedItem !== "" && updatedItem !== currentText) {
            // Send an AJAX request to the server to update the item
            $.ajax({
                url: '/editItem',
                method: 'PUT',
                data: { index: index, updatedItem: updatedItem }, //index is the number of the item in the array, updatedItem is what you changed it to, saving it to data to be called in the success function
                dataType: 'json', // Ensure that jQuery treats the response as JSON
                success: function (data) {
                    //
                    todoArray = data.values
                    // Handle success, e.g., update the UI with the new todoArray, stored in data
                    displayValues(todoArray);
                },
                error: function (error) {
                    // Handle error, if needed
                    console.error('Error:', error);
                }
            });
        } else {
            // If the value is empty or unchanged, restore the original text
            listedItemsElement.html(currentText);
        }
    };

    // Replace the text with a empty input field and add the "OK" button
    listedItemsElement.empty().append(inputField).append(okButton);

    // Focus on the input field for a better user experience
    inputField.focus();

    // Add a blur event to the input field to handle editing completion
    inputField.blur(function () {
        completeEditing();
    });

    // Add a click event to the "OK" button to handle editing completion
    okButton.click(function (event) {
        event.preventDefault();
        completeEditing();
    });
};


$(document).ready(function () { //just here to make sure that there is no errors or delayed responses with the layout
    $('#listItem').on('input', function () {
        $(this).css('height', 'auto'); // Reset height to auto
        $(this).css('height', this.scrollHeight + 2 + 'px'); // Set height to scrollHeight + some padding
    });

    // Code for the active tab on the header
    // If the currentPage's link is '/' or '/contact' or '/about'
    const currentPage = window.location.pathname;

    // Add the "active-link" class to the corresponding nav link
    $('.nav-item a').each((index, element) => {
        const $link = $(element);
        if ($link.attr('href') === currentPage) { //find which page is open
            $link.addClass('active-link'); //and add the class with the 'nav-item' styles
        }
    });

    // Parse the JSON string back to an array
const data = JSON.parse($('.weatherInfo').text() || "[]");
console.log(data)
if (data.length > 0) {
    createChart(data);

    function createChart(data) {
        // Get current date and time
        const now = new Date();
        const currentTime = `${String(now.getHours()).padStart(2, '0')}:00`;
        const shortToday = now.toLocaleString('en-us', { weekday: 'short' });

        // Group the data by day
        const groupedData = {};
        data.forEach(item => {
            if (!groupedData[item.date]) {
                groupedData[item.date] = [];
            }
            groupedData[item.date].push({ time: item.time, temperature_2m: item.temperature_2m });
        });

        // Prepare the data
        const labels = [];
        const temperatures = [];

        let hasCurrentTimePassed = false;
        Object.keys(groupedData).forEach(day => {
            const dayData = groupedData[day];
            dayData.forEach((item, index) => {
                if (!hasCurrentTimePassed) {
                    if (day === shortToday && item.time < currentTime) {
                        return; // Skip times that have passed today
                    }
                    hasCurrentTimePassed = true;
                }
                if (index === 1) {
                    labels.push(`${day.slice(0, 3)} - ${item.time}`);
                } else {
                    labels.push(item.time);
                }
                temperatures.push(item.temperature_2m);
            });
        });
        
        // Create the chart
        const ctx = document.getElementById('weatherChart').getContext('2d');
        const temperatureChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Temperature (°C)',
                    data: temperatures,
                    borderColor: '#e5b485',
                    borderWidth: 2,
                    backgroundColor: 'rgba(98, 64, 114, 0.3)',
                    fill: true,
                    pointRadius: 0,
                }]
            },
            options: {
                scales: {
                    y: {
                        beginAtZero: false,
                        ticks: {
                            font: {
                                size: 10, // Change the font size of the y-axis ticks
                            },
                            color: 'black'
                        }
                    },
                    x: {
                        ticks: {
                            font: {
                                size:8, // Change the font size of the x-axis ticks
                            },
                            color: 'black'
                        }
                    }
                },
                plugins: {
                    legend: {
                        labels: {
                            font: {
                                size: 10 // Change the font size of the legend
                            },
                            color: 'black'
                        }
                    }
                }
            }
        });
    }
}

})

// Add an event listener to handle the click event using jQuery
$('#submitButton').on('click', submitItem);

/**

1. todoArray: An array to store todo items on the client-side.
2. submitItem: Function to handle form submission when adding a new item. Uses AJAX to send a POST request to the server, updates the UI on success.
3. displayValues: Function to display todo items on the client-side. Clears the existing list and renders the updated list with buttons for removal and editing.
4. removeItem: Function to handle removing an item. Uses AJAX to send a DELETE request to the server, updates the UI on success.
5. editItem: Function to handle editing an item. Prompts the user for a new value, sends a PUT request to the server, and updates the UI on success.

 */

/*project 3 */
const realDate = new Date().getFullYear()
$('#theYear').text(realDate)

//the dropdown of the login and the projects
$('.usersLogin').click(userDropdown)
function userDropdown() {
  $('.user-dropdown').toggle();
}

$('.projectdropdown').click(projectsDropdown)
function projectsDropdown() {
  $('.projects-dropdown').toggle();
}

// Click event listener for the document body to close dropdowns when clicking outside
$(document.body).on('click', function(event) {
  // Check if the clicked element is not within the user dropdown or its trigger element
  if (!$(event.target).closest('.user-dropdown, .usersLogin').length) {
    // Close the user dropdown if it's open
    $('.user-dropdown').hide();
  }
  // Check if the clicked element is not within the projects dropdown or its trigger element
  if (!$(event.target).closest('.projects-dropdown, .projectdropdown').length) {
    // Close the projects dropdown if it's open
    $('.projects-dropdown').hide();
  }
});


function confirmDelete1() {
  // Display a confirmation dialog
  var confirmation = confirm('Are you sure you want to delete this user?');

  // If confirmed, submit the form
  if (confirmation) {
      return true; // Allow form submission
  } else {
      return false; // Prevent form submission
  }
}
$('.confirmDelete').click(confirmDelete1)

function confirmDelete2() {
  // Display a confirmation dialog
  var confirmation = confirm('Are you sure you want to delete this book?');

  // If confirmed, submit the form
  if (confirmation) {
      return true; // Allow form submission
  } else {
      return false; // Prevent form submission
  }
}
$('.deleteButton').click(confirmDelete2)

// JavaScript to capture the sorting criteria when a dropdown item is clicked
$(document).ready(function() {
    $('.dropdown-item').click(function(e) {
        e.preventDefault();
      
        // Get the value of the data-sort-by attribute of the clicked item
        let sortBy = $(this).data('sort-by');
      
        // Set the value of the hidden input field to the selected sorting criteria
        $('#sortBy').val(sortBy);
      
        // Submit the form
        $(this).closest('form').submit();
    });

    //limiting the max amount of characters allowed
    const maxChars = 255;

    $('.enterBookInfo').on('input paste', function() {
        const text = $(this).val();
        const remainingChars = maxChars - text.length;

        if (remainingChars < 0) {
        $(this).val(text.slice(0, maxChars));
        }

        $('#charCount').text('Characters left: ' + Math.max(0, remainingChars));
    });

    let prevScrollpos = $(window).scrollTop();
    const dropdownBtn = $("#dropdownBtn");
    const dropdownContent = $("#dropdownBTNContent");

    $(window).scroll(function() {
        const currentScrollPos = $(window).scrollTop();
        if (prevScrollpos > currentScrollPos) {
            dropdownBtn.show();
        } else {
            dropdownBtn.hide();
        }
        prevScrollpos = currentScrollPos;
    });

    dropdownBtn.click(function() {
        dropdownContent.toggleClass("show");
    });

    // Close the dropdown content when clicking outside of it
    $(document).on('click', function(event) {
        if (!$(event.target).closest('#dropdownBtn, #dropdownBTNContent').length) {
            dropdownContent.removeClass("show");
        }
    });
});


//function for the stars
function starsFunction(starsTotal) {
  //just in case, someone adds a decimal number
  const wholeNum = Math.floor(starsTotal)
  //just in case someone puts a number higher than 5
  if (wholeNum > 5) {
    wholeNum = 5
  }
  let starNum = ''
  for (let i = 0; i < wholeNum; i++) {
      starNum += '★'
  }
  const emptyStars = 5 - starNum.length
  for (let i = 0; i < emptyStars; i++) {
      starNum += '☆';
  }
  return starNum
}

// Select all elements with the class '.bookRating'
let bookRatingElements = $('.bookRating');

// Iterate over each '.bookRating' element
bookRatingElements.each(function() {
    // Retrieve the text content of the current element
    let starsText = $(this).text();

    // Extract the numerical rating value from the text content
    let stars = parseInt(starsText.split(":")[1].trim()); // Assuming the rating is after a colon and has no leading/trailing whitespace

    // Call the function to convert the rating to stars
    let rating = starsFunction(stars);

    // Update the text content of the current element with the star representation
    $(this).text(rating);
}); 