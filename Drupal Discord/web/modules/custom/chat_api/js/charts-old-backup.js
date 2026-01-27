/**
 * @file
 * Chart.js integration for admin reports
 */

(function ($, Drupal) {
  "use strict";

  Drupal.behaviors.chatAdminCharts = {
    attach: function (context, settings) {
      // TODO: Initialize Chart.js
      // Note: Chart.js needs to be loaded first (via CDN or local library)

      if (typeof Chart === "undefined") {
        console.warn("Chart.js not loaded. Please include Chart.js library.");
        return;
      }

      /**
       * Activity Chart on Dashboard
       */
      const activityCanvas = document.getElementById("activityChart");
      if (activityCanvas && !activityCanvas.chartInstance) {
        const ctx = activityCanvas.getContext("2d");

        activityCanvas.chartInstance = new Chart(ctx, {
          type: "line",
          data: {
            labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
            datasets: [
              {
                label: "Messages",
                data: [12, 19, 3, 5, 2, 3, 7], // TODO: Fetch real data
                borderColor: "rgb(102, 126, 234)",
                backgroundColor: "rgba(102, 126, 234, 0.1)",
                tension: 0.4,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
              legend: {
                display: true,
                position: "top",
              },
            },
          },
        });
      }

      /**
       * Messages per Day Chart
       */
      const messagesCanvas = document.getElementById("messagesPerDayChart");
      if (messagesCanvas && !messagesCanvas.chartInstance) {
        const ctx = messagesCanvas.getContext("2d");

        messagesCanvas.chartInstance = new Chart(ctx, {
          type: "bar",
          data: {
            labels: [
              "Day 1",
              "Day 2",
              "Day 3",
              "Day 4",
              "Day 5",
              "Day 6",
              "Day 7",
            ],
            datasets: [
              {
                label: "Messages",
                data: [65, 59, 80, 81, 56, 55, 40], // TODO: Fetch from Node.js
                backgroundColor: "rgba(102, 126, 234, 0.8)",
                borderColor: "rgb(102, 126, 234)",
                borderWidth: 1,
              },
            ],
          },
          options: {
            responsive: true,
            scales: {
              y: {
                beginAtZero: true,
              },
            },
          },
        });
      }

      /**
       * New Users Chart
       */
      const newUsersCanvas = document.getElementById("newUsersChart");
      if (newUsersCanvas && !newUsersCanvas.chartInstance) {
        const ctx = newUsersCanvas.getContext("2d");

        newUsersCanvas.chartInstance = new Chart(ctx, {
          type: "line",
          data: {
            labels: [
              "Day 1",
              "Day 2",
              "Day 3",
              "Day 4",
              "Day 5",
              "Day 6",
              "Day 7",
            ],
            datasets: [
              {
                label: "New Users",
                data: [5, 8, 3, 7, 4, 6, 9], // TODO: Fetch from database
                borderColor: "rgb(240, 147, 251)",
                backgroundColor: "rgba(240, 147, 251, 0.1)",
                tension: 0.4,
              },
            ],
          },
          options: {
            responsive: true,
            scales: {
              y: {
                beginAtZero: true,
                ticks: {
                  stepSize: 1,
                },
              },
            },
          },
        });
      }

      /**
       * Message Chart (Reports page)
       */
      const messageChartCanvas = document.getElementById("messageChart");
      if (messageChartCanvas && !messageChartCanvas.chartInstance) {
        const ctx = messageChartCanvas.getContext("2d");

        messageChartCanvas.chartInstance = new Chart(ctx, {
          type: "doughnut",
          data: {
            labels: ["Text Messages", "Image Messages", "Other"],
            datasets: [
              {
                data: [300, 50, 20], // TODO: Fetch real data
                backgroundColor: [
                  "rgba(102, 126, 234, 0.8)",
                  "rgba(240, 147, 251, 0.8)",
                  "rgba(79, 172, 254, 0.8)",
                ],
              },
            ],
          },
          options: {
            responsive: true,
            plugins: {
              legend: {
                position: "bottom",
              },
            },
          },
        });
      }

      // TODO: Fetch real data from backend APIs
      // TODO: Add chart update functions
      // TODO: Add date range filters
    },
  };

  /**
   * TODO: Function to update charts with new data
   */
  Drupal.chatAdmin = Drupal.chatAdmin || {};

  Drupal.chatAdmin.updateCharts = function (data) {
    // TODO: Update all charts with fetched data
    console.log("TODO: Update charts with data:", data);
  };
})(jQuery, Drupal);
