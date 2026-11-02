import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";

// no StrictMode: effects that start a payment claim must run exactly once
createRoot(document.getElementById("root")).render(<BrowserRouter><App /></BrowserRouter>);
