package com.moji.mobile.ui.navigation

sealed class AppDestination(val route: String) {
    data object SignIn : AppDestination("signin")
    data object SignUp : AppDestination("signup")
    data object Home : AppDestination("home")
}
