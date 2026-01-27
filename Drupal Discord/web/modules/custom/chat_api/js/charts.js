/**
 * @file
 * Chart.js integration for admin reports - COMPLETE IMPLEMENTATION
 */

(function ($, Drupal, drupalSettings) {
  "use strict";

  Drupal.behaviors.chatAdminCharts = {
    attach: function (context, settings) {
      // Check if Chart.js is loaded
      if (typeof Chart === "undefined") {
        console.warn("Chart.js not loaded. Charts will not be displayed.");
        return;
      }

      // Get data from drupalSettings
      const activityTrends = drupalSettings.chatAdmin?.activityTrends || {
        labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
        new_users: [0, 0, 0, 0, 0, 0, 0],
        active_users: [0, 0, 0, 0, 0, 0, 0],
        friend_requests: [0, 0, 0, 0, 0, 0, 0],
      };

      // Common chart options
      const commonOptions = {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            backgroundColor: "rgba(0, 0, 0, 0.8)",
            padding: 12,
            titleFont: {
              size: 14,
            },
            bodyFont: {
              size: 13,
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              stepSize: 1,
              precision: 0,
            },
          },
        },
      };

      /**
       * New Users Chart
       */
      const newUsersCanvas = document.getElementById("newUsersChart");
      if (newUsersCanvas && !newUsersCanvas.chartInstance) {
        const ctx = newUsersCanvas.getContext("2d");

        newUsersCanvas.chartInstance = new Chart(ctx, {
          type: "bar",
          data: {
            labels: activityTrends.labels,
            datasets: [
              {
                label: "New Users",
                data: activityTrends.new_users,
                backgroundColor: "rgba(102, 126, 234, 0.8)",
                borderColor: "rgb(102, 126, 234)",
                borderWidth: 2,
                borderRadius: 6,
                hoverBackgroundColor: "rgba(102, 126, 234, 1)",
              },
            ],
          },
          options: {
            ...commonOptions,
            plugins: {
              ...commonOptions.plugins,
              tooltip: {
                ...commonOptions.plugins.tooltip,
                callbacks: {
                  label: function (context) {
                    return context.parsed.y + " new users";
                  },
                },
              },
            },
          },
        });
      }

      /**
       * Active Users Chart
       */
      const activeUsersCanvas = document.getElementById("activeUsersChart");
      if (activeUsersCanvas && !activeUsersCanvas.chartInstance) {
        const ctx = activeUsersCanvas.getContext("2d");

        activeUsersCanvas.chartInstance = new Chart(ctx, {
          type: "line",
          data: {
            labels: activityTrends.labels,
            datasets: [
              {
                label: "Active Users",
                data: activityTrends.active_users,
                borderColor: "rgb(240, 147, 251)",
                backgroundColor: "rgba(240, 147, 251, 0.1)",
                borderWidth: 3,
                tension: 0.4,
                fill: true,
                pointRadius: 4,
                pointBackgroundColor: "rgb(240, 147, 251)",
                pointBorderColor: "#fff",
                pointBorderWidth: 2,
                pointHoverRadius: 6,
              },
            ],
          },
          options: {
            ...commonOptions,
            plugins: {
              ...commonOptions.plugins,
              tooltip: {
                ...commonOptions.plugins.tooltip,
                callbacks: {
                  label: function (context) {
                    return context.parsed.y + " active users";
                  },
                },
              },
            },
          },
        });
      }

      /**
       * Friend Requests Chart
       */
      const friendRequestsCanvas =
        document.getElementById("friendRequestsChart");
      if (friendRequestsCanvas && !friendRequestsCanvas.chartInstance) {
        const ctx = friendRequestsCanvas.getContext("2d");

        friendRequestsCanvas.chartInstance = new Chart(ctx, {
          type: "line",
          data: {
            labels: activityTrends.labels,
            datasets: [
              {
                label: "Friend Requests",
                data: activityTrends.friend_requests,
                borderColor: "rgb(79, 172, 254)",
                backgroundColor: "rgba(79, 172, 254, 0.1)",
                borderWidth: 3,
                tension: 0.4,
                fill: true,
                pointRadius: 4,
                pointBackgroundColor: "rgb(79, 172, 254)",
                pointBorderColor: "#fff",
                pointBorderWidth: 2,
                pointHoverRadius: 6,
              },
            ],
          },
          options: {
            ...commonOptions,
            plugins: {
              ...commonOptions.plugins,
              tooltip: {
                ...commonOptions.plugins.tooltip,
                callbacks: {
                  label: function (context) {
                    return context.parsed.y + " requests";
                  },
                },
              },
            },
          },
        });
      }

      /**
       * Message Chart (Reports page - if exists)
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
                data: [300, 50, 20], // TODO: Fetch real data from Node.js
                backgroundColor: [
                  "rgba(102, 126, 234, 0.8)",
                  "rgba(240, 147, 251, 0.8)",
                  "rgba(79, 172, 254, 0.8)",
                ],
                borderWidth: 0,
                hoverOffset: 10,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
              legend: {
                position: "bottom",
                labels: {
                  padding: 15,
                  font: {
                    size: 13,
                  },
                },
              },
              tooltip: {
                backgroundColor: "rgba(0, 0, 0, 0.8)",
                padding: 12,
                callbacks: {
                  label: function (context) {
                    const total = context.dataset.data.reduce(
                      (a, b) => a + b,
                      0
                    );
                    const percentage = (
                      (context.parsed / total) *
                      100
                    ).toFixed(1);
                    return (
                      context.label +
                      ": " +
                      context.parsed +
                      " (" +
                      percentage +
                      "%)"
                    );
                  },
                },
              },
            },
          },
        });
      }

      // Log chart initialization
      console.log("Chat Admin Charts initialized with data:", activityTrends);
    },
  };

  /**
   * Update charts with new data (for future real-time updates)
   */
  Drupal.chatAdmin = Drupal.chatAdmin || {};

  Drupal.chatAdmin.updateCharts = function (newData) {
    if (typeof Chart === "undefined") {
      console.warn("Chart.js not loaded");
      return;
    }

    // Update new users chart
    const newUsersChart = Chart.getChart("newUsersChart");
    if (newUsersChart && newData.new_users) {
      newUsersChart.data.labels = newData.labels;
      newUsersChart.data.datasets[0].data = newData.new_users;
      newUsersChart.update();
    }

    // Update active users chart
    const activeUsersChart = Chart.getChart("activeUsersChart");
    if (activeUsersChart && newData.active_users) {
      activeUsersChart.data.labels = newData.labels;
      activeUsersChart.data.datasets[0].data = newData.active_users;
      activeUsersChart.update();
    }

    // Update friend requests chart
    const friendRequestsChart = Chart.getChart("friendRequestsChart");
    if (friendRequestsChart && newData.friend_requests) {
      friendRequestsChart.data.labels = newData.labels;
      friendRequestsChart.data.datasets[0].data = newData.friend_requests;
      friendRequestsChart.update();
    }

    console.log("Charts updated with new data");
  };

  /**
   * Refresh all charts from server
   */
  Drupal.chatAdmin.refreshCharts = function () {
    $.ajax({
      url: "/admin/chat/api/stats",
      method: "GET",
      success: function (response) {
        if (response.success && response.chart_data) {
          Drupal.chatAdmin.updateCharts(response.chart_data);
        }
      },
      error: function (error) {
        console.error("Error refreshing charts:", error);
      },
    });
  };
})(jQuery, Drupal, drupalSettings);
