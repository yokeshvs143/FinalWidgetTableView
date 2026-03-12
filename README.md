 $(document).ready(function () {
    $('.usrnm-txtbx, .pswd-txtbx').keypress(function (e) {
      if (e.which === 13) { // Check if Enter key is pressed
        $('.lgn-btn').click(); // Trigger the click event of the login button
      }
    });
  });
