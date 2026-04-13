package com.moji.mobile.ui.navigation

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.moji.mobile.feature.auth.ui.SignInScreen
import com.moji.mobile.feature.auth.ui.SignUpScreen
import com.moji.mobile.ui.MainViewModel
import com.moji.mobile.ui.home.HomeScreen

private fun NavHostController.navigateClearingStack(route: String) {
    navigate(route) {
        popUpTo(graph.findStartDestination().id) {
            inclusive = true
        }
        launchSingleTop = true
    }
}

@Composable
fun AppNavGraph(
    navController: NavHostController = rememberNavController(),
    mainViewModel: MainViewModel = hiltViewModel(),
) {
    val bootstrapping by mainViewModel.bootstrapping.collectAsStateWithLifecycle()
    val session by mainViewModel.session.collectAsStateWithLifecycle()

    if (bootstrapping) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center,
        ) {
            CircularProgressIndicator()
        }
        return
    }

    val startDestination = if (session.isAuthenticated) {
        AppDestination.Home.route
    } else {
        AppDestination.SignIn.route
    }

    NavHost(
        navController = navController,
        startDestination = startDestination,
    ) {
        composable(AppDestination.SignIn.route) {
            SignInScreen(
                onNavigateSignUp = {
                    navController.navigate(AppDestination.SignUp.route)
                },
                onSignInSuccess = {
                    navController.navigateClearingStack(AppDestination.Home.route)
                },
            )
        }

        composable(AppDestination.SignUp.route) {
            SignUpScreen(
                onNavigateSignIn = {
                    navController.popBackStack()
                },
                onSignUpSuccess = {
                    navController.navigateClearingStack(AppDestination.SignIn.route)
                },
            )
        }

        composable(AppDestination.Home.route) {
            HomeScreen(
                sessionState = session,
                onSignOut = {
                    mainViewModel.signOut {
                        navController.navigateClearingStack(AppDestination.SignIn.route)
                    }
                },
            )
        }
    }
}
